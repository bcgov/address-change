"""Portable Docker Compose lifecycle commands. Requires Python 3.10+ and Docker."""

import argparse
from collections import deque
import contextlib
import json
import re
import shutil
import socket
from pathlib import Path
import subprocess
import sys
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
COMMAND_LOG = None


class LifecycleError(RuntimeError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


class ArgumentParser(argparse.ArgumentParser):
    def error(self, message):
        raise LifecycleError('INVALID_ARGUMENT', message)


def parse_version(value):
    match = re.fullmatch(r'v?(\d+)\.(\d+)\.(\d+)(?:[+-][\w.-]+)?', value.strip())
    if not match:
        raise LifecycleError('COMPOSE_VERSION_UNKNOWN', 'Could not determine Docker Compose version; install Compose v2.20+.')
    return tuple(map(int, match.groups()))


def containers(value):
    value = value.strip()
    return json.loads(value) if value.startswith('[') else [json.loads(line) for line in value.splitlines()]


def check_port(config, running):
    ports = config.get('services', {}).get('api', {}).get('ports', [])
    bindings = [p for p in ports if p.get('target') == 8080 and p.get('protocol', 'tcp') == 'tcp']
    if len(bindings) != 1:
        raise LifecycleError('INVALID_CONFIG', 'Configure exactly one published TCP port for API port 8080 in compose.yml.')
    binding = bindings[0]
    published = str(binding.get('published', ''))
    if not published.isascii() or not published.isdigit() or not 1 <= int(published) <= 65535:
        raise LifecycleError('INVALID_PORT', 'SERVER_PORT must be an integer from 1 to 65535.')
    port = int(published)
    host = binding.get('host_ip', '0.0.0.0')
    for item in running:
        if item.get('Service') == 'api' and item.get('State') == 'running':
            for mapping in item.get('Publishers') or []:
                if (mapping.get('TargetPort') == 8080 and mapping.get('PublishedPort') == port
                        and mapping.get('Protocol') == 'tcp' and mapping.get('URL') == host):
                    print(f'Port {port} is already assigned to this project API.')
                    return
    family = socket.AF_INET6 if ':' in host else socket.AF_INET
    try:
        with socket.socket(family, socket.SOCK_STREAM) as probe:
            if hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
                probe.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            probe.bind((host, port))
    except OSError as error:
        raise LifecycleError('PORT_UNAVAILABLE', f'Cannot use API port {port}: {error.strerror}. '
                           'Choose another SERVER_PORT in .env or your shell; no listener was stopped.') from error
    print(f'API port {port} is available (availability can change before startup).')


def check_prerequisites(check_binding=False):
    if sys.version_info < (3, 10):
        raise LifecycleError('PYTHON_VERSION_UNSUPPORTED', 'Python 3.10+ is required; run this helper with a supported Python interpreter.')
    if shutil.which('docker') is None:
        raise LifecycleError('DOCKER_NOT_FOUND', 'Docker was not found on PATH. Install Docker with Compose in this environment.')
    try:
        version = compose('version', '--short', capture=True).stdout.strip()
    except subprocess.CalledProcessError as error:
        raise LifecycleError('COMPOSE_UNAVAILABLE', 'Docker Compose is unavailable. Install the Compose v2.20+ plugin.') from error
    if parse_version(version) < (2, 20, 0):
        raise LifecycleError('COMPOSE_VERSION_UNSUPPORTED', f'Docker Compose {version} is too old; version 2.20+ is required.')
    try:
        subprocess.run(['docker', 'info', '--format', '{{.ServerVersion}}'], cwd=ROOT,
                       check=True, capture_output=True, text=True, timeout=15)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
        raise LifecycleError('DOCKER_UNAVAILABLE', 'Docker daemon is unreachable. Start Docker and check your Docker context and permissions.') from error
    try:
        config = json.loads(compose('config', '--format', 'json', capture=True).stdout)
    except (subprocess.CalledProcessError, ValueError) as error:
        raise LifecycleError('INVALID_CONFIG', 'Compose configuration is invalid. Check compose.yml and SERVER_PORT in .env or the shell.') from error
    print(f'Python {sys.version_info.major}.{sys.version_info.minor}, Compose {version}, and Docker daemon checks passed.')
    if check_binding:
        running = containers(compose('ps', '--format', 'json', 'api', capture=True).stdout)
        check_port(config, running)


def compose(*args, capture=False):
    if not capture and COMMAND_LOG is not None:
        COMMAND_LOG.write('\n$ docker compose ' + ' '.join(args) + '\n')
        COMMAND_LOG.flush()
        return subprocess.run(
            ['docker', 'compose', *args], cwd=ROOT, check=True, text=True,
            stdout=COMMAND_LOG, stderr=subprocess.STDOUT,
        )
    return subprocess.run(
        ['docker', 'compose', *args], cwd=ROOT, check=True,
        text=True, capture_output=capture,
    )


def verify_health():
    container = compose('ps', '--format', 'json', 'api', capture=True).stdout.strip()
    entries = json.loads(container) if container.startswith('[') else [json.loads(line) for line in container.splitlines()]
    if not entries or any(item.get('Health') != 'healthy' for item in entries):
        raise LifecycleError('API_UNHEALTHY', 'API container is not healthy. Use the logs command for details.')
    binding = compose('port', 'api', '8080', capture=True).stdout.strip().splitlines()[0]
    port = int(binding.rsplit(':', 1)[1])
    url = f'http://localhost:{port}/actuator/health'
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(url, timeout=5) as response:
        if response.status != 200 or json.load(response).get('status') != 'UP':
            raise LifecycleError('API_UNHEALTHY', 'API health endpoint did not report UP.')
    return url


def main():
    global COMMAND_LOG
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['check', 'start', 'restart', 'status', 'stop', 'logs', 'test', 'format', 'format-check'])
    parser.add_argument('--timeout', type=int, default=180, help='Startup wait in seconds (default: 180)')
    parser.add_argument('--json', action='store_true', help='Emit one JSON result to stdout')
    parser.add_argument('--verbose', action='store_true', help='Print full command log after completion (stderr with --json)')
    json_mode = '--json' in sys.argv[1:]
    result = dict(schema_version=1, action=None, success=False, message='', error_code=None,
                  health_url=None, log_path=None, diagnostics=[])
    args = None
    exit_code = 0
    try:
        args = parser.parse_args()
        result['action'] = args.action
        if args.timeout < 1:
            parser.error('--timeout must be positive')
        log_dir = ROOT / '.run' / 'logs'
        log_dir.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(mode='w+', encoding='utf-8', suffix='.log',
                                         prefix=args.action + '-', dir=log_dir, delete=False) as log:
            COMMAND_LOG = log
            result['log_path'] = str(Path(log.name).resolve())
            try:
                with contextlib.redirect_stdout(log):
                    result['health_url'] = run_action(args)
            except (OSError, subprocess.SubprocessError, ValueError, RuntimeError, IndexError) as error:
                if args.action in ('start', 'restart', 'status'):
                    try:
                        compose('logs', '--tail=50', 'api')
                    except (OSError, subprocess.SubprocessError):
                        pass
                raise error
        result['success'] = True
        result['message'] = {
            'check': 'Prerequisites and configuration passed.',
            'start': 'API started and healthy.', 'restart': 'API restarted and healthy.',
            'status': 'API is healthy.', 'stop': 'Application stopped; volumes preserved.',
            'logs': 'Recent API logs collected.', 'test': 'Tests and build checks passed.',
            'format': 'Java formatting applied.', 'format-check': 'Java formatting passed.',
        }[args.action]
    except (OSError, subprocess.SubprocessError, ValueError, RuntimeError, IndexError) as error:
        exit_code = 2 if isinstance(error, LifecycleError) and error.code == 'INVALID_ARGUMENT' else 1
        result['error_code'] = getattr(error, 'code', 'COMMAND_FAILED' if isinstance(error, subprocess.SubprocessError) else 'CHECK_FAILED')
        result['message'] = str(error)
    finally:
        COMMAND_LOG = None
    if result['log_path']:
        if not result['success'] or result['action'] == 'logs':
            with open(result['log_path'], encoding='utf-8', errors='replace') as log:
                result['diagnostics'] = ''.join(deque(log, maxlen=20))[-4000:].splitlines()
    if json_mode:
        print(json.dumps(result))
    else:
        print(('OK: ' if result['success'] else 'ERROR: ') + result['message'])
        if result['health_url']:
            print(result['health_url'])
        if result['log_path']:
            print('Log: ' + result['log_path'])
        if not (args and args.verbose):
            print('\n'.join(result['diagnostics']), end='\n' if result['diagnostics'] else '')
    if args and args.verbose and result['log_path']:
        with open(result['log_path'], encoding='utf-8', errors='replace') as log:
            shutil.copyfileobj(log, sys.stderr if json_mode else sys.stdout)
    return exit_code


def run_action(args):
    check_prerequisites(check_binding=args.action in ('check', 'start', 'restart'))
    if args.action == 'check':
        print('Docker, Compose, and project configuration are ready.')
    elif args.action in ('start', 'restart'):
        options = ['up', '--build', '-d', '--wait', '--wait-timeout', str(args.timeout)]
        if args.action == 'restart':
            options.append('--force-recreate')
        compose(*options)
        return verify_health()
    elif args.action == 'status':
        compose('ps')
        return verify_health()
    elif args.action == 'stop':
        compose('down')
    elif args.action == 'logs':
        compose('logs', '--tail=100', 'api')
    elif args.action == 'test':
        compose('run', '--rm', '--no-deps', 'api', 'sh', './mvnw', '--batch-mode',
                '--no-transfer-progress', '-f', 'api/pom.xml', 'clean', 'verify')
    elif args.action in ('format', 'format-check'):
        service = 'formatter' if args.action == 'format' else 'api'
        options = ['run', '--rm', '--no-deps', '--build']
        goal = 'spotless:apply' if args.action == 'format' else 'spotless:check'
        compose(*options, service, 'sh', './mvnw', '--batch-mode', '--no-transfer-progress',
                '-f', 'api/pom.xml', goal)

if __name__ == '__main__':
    sys.exit(main())
