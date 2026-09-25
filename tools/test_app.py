"""Health verification must reject unhealthy containers and failed API health."""

import io
import json
from pathlib import Path
import socket
import subprocess
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import app


class OutputTests(unittest.TestCase):
    def invoke(self, arguments, action):
        with tempfile.TemporaryDirectory() as directory:
            with patch('app.ROOT', Path(directory)), patch('sys.argv', ['app.py', *arguments]), \
                    patch('app.run_action', side_effect=action), \
                    patch('sys.stdout', new_callable=io.StringIO) as output, \
                    patch('sys.stderr', new_callable=io.StringIO) as errors:
                code = app.main()
                text = output.getvalue()
                result = json.loads(text) if '--json' in arguments else None
                log = Path(result['log_path']).read_text() if result and result['log_path'] else ''
                return code, text, errors.getvalue(), result, log

    def test_json_success_contains_no_command_noise(self):
        def action(args):
            print('build detail')
            return 'http://localhost:8080/actuator/health'
        code, text, errors, result, log = self.invoke(['start', '--json'], action)
        self.assertEqual(0, code)
        self.assertTrue(result['success'])
        self.assertEqual(1, len(text.splitlines()))
        self.assertEqual([], result['diagnostics'])
        self.assertIn('build detail', log)
        self.assertEqual('', errors)

    def test_json_failure_has_code_and_bounded_diagnostics(self):
        def action(args):
            for number in range(100):
                print(f'failure detail {number}')
            raise app.LifecycleError('DOCKER_UNAVAILABLE', 'Start Docker.')
        code, text, errors, result, log = self.invoke(['check', '--json'], action)
        self.assertEqual(1, code)
        self.assertEqual('DOCKER_UNAVAILABLE', result['error_code'])
        self.assertFalse(result['success'])
        self.assertLessEqual(len(result['diagnostics']), 20)
        self.assertIn('failure detail 99', result['diagnostics'])
        self.assertIn('failure detail 0', log)

    def test_verbose_keeps_json_stdout_clean(self):
        def action(args):
            print('verbose detail')
        code, text, errors, result, log = self.invoke(['check', '--json', '--verbose'], action)
        self.assertTrue(result['success'])
        self.assertIn('verbose detail', errors)
        self.assertNotIn('verbose detail', text)

    def test_invalid_arguments_are_json(self):
        for arguments in (['bad', '--json'], ['check', '--timeout', '0', '--json']):
            with self.subTest(arguments=arguments):
                code, text, errors, result, log = self.invoke(arguments, None)
                self.assertEqual(2, code)
                self.assertEqual('INVALID_ARGUMENT', result['error_code'])
                self.assertIsNone(result['log_path'])

    def test_default_success_is_concise(self):
        def action(args):
            print('full build output')
        code, text, errors, result, log = self.invoke(['test'], action)
        self.assertEqual(0, code)
        self.assertIn('OK:', text)
        self.assertNotIn('full build output', text)


class PrerequisiteTests(unittest.TestCase):
    def test_compose_versions(self):
        self.assertEqual((2, 20, 0), app.parse_version('v2.20.0'))
        self.assertEqual((5, 0, 2), app.parse_version('5.0.2'))
        with self.assertRaises(RuntimeError):
            app.parse_version('unknown')

    @patch('app.sys.version_info', (3, 9))
    def test_old_python(self):
        with self.assertRaisesRegex(RuntimeError, 'Python 3.10'):
            app.check_prerequisites()

    @patch('app.shutil.which', return_value=None)
    def test_missing_docker(self, which):
        with self.assertRaisesRegex(RuntimeError, 'not found'):
            app.check_prerequisites()

    @patch('app.shutil.which', return_value='/bin/docker')
    @patch('app.compose', return_value=SimpleNamespace(stdout='v2.19.1'))
    def test_old_compose(self, compose, which):
        with self.assertRaisesRegex(RuntimeError, 'too old'):
            app.check_prerequisites()

    @patch('app.shutil.which', return_value='/bin/docker')
    @patch('app.compose', return_value=SimpleNamespace(stdout='v2.20.0'))
    @patch('app.subprocess.run', side_effect=subprocess.CalledProcessError(1, 'docker'))
    def test_unreachable_daemon(self, run, compose, which):
        with self.assertRaisesRegex(RuntimeError, 'daemon is unreachable'):
            app.check_prerequisites()

    def config(self, port):
        return {'services': {'api': {'ports': [{'target': 8080, 'published': str(port),
                                              'host_ip': '127.0.0.1'}]}}}

    def test_invalid_port(self):
        for port in ('0', '65536', 'abc', '8000-8010'):
            with self.subTest(port=port), self.assertRaisesRegex(RuntimeError, 'SERVER_PORT'):
                app.check_port(self.config(port), [])

    def test_unrelated_listener_is_rejected(self):
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            listener.listen()
            with self.assertRaisesRegex(RuntimeError, 'no listener was stopped'):
                app.check_port(self.config(listener.getsockname()[1]), [])

    @patch('app.socket.socket')
    def test_existing_project_api_is_allowed(self, probe):
        running = [{'Service': 'api', 'State': 'running', 'Publishers': [
            {'TargetPort': 8080, 'PublishedPort': 8080, 'Protocol': 'tcp', 'URL': '127.0.0.1'}]}]
        with patch('sys.stdout', new_callable=io.StringIO):
            app.check_port(self.config(8080), running)
        probe.assert_not_called()


class FormatCommandTests(unittest.TestCase):
    @patch('app.check_prerequisites')
    @patch('app.compose')
    def test_only_apply_uses_formatter_service(self, compose, prerequisites):
        for action, goal in [('format', 'spotless:apply'), ('format-check', 'spotless:check')]:
            with self.subTest(action=action), patch('sys.argv', ['app.py', action]):
                self.assertEqual(0, app.main())
                arguments = compose.call_args.args
                self.assertEqual(goal, arguments[-1])
                self.assertEqual(action == 'format', 'formatter' in arguments)
                self.assertEqual(action == 'format-check', 'api' in arguments)
                self.assertIn('--rm', arguments)


class HealthTests(unittest.TestCase):
    @patch('app.urllib.request.build_opener')
    @patch('app.compose')
    def test_unhealthy_container_does_not_report_success(self, compose, opener):
        compose.return_value.stdout = '{"Health":"unhealthy"}'
        with self.assertRaises(RuntimeError):
            app.verify_health()
        opener.assert_not_called()

    @patch('app.urllib.request.build_opener')
    @patch('app.compose')
    def test_healthy_container_still_requires_up_response(self, compose, opener):
        compose.side_effect = [SimpleNamespace(stdout='[{"Health":"healthy"}]'),
                               SimpleNamespace(stdout='127.0.0.1:18080')]
        response = io.BytesIO(b'{"status":"DOWN"}')
        response.status = 200
        opener.return_value.open.return_value = response
        with self.assertRaises(RuntimeError):
            app.verify_health()

    @patch('app.urllib.request.build_opener')
    @patch('app.compose')
    def test_verifies_the_actual_published_port(self, compose, opener):
        compose.side_effect = [SimpleNamespace(stdout='{"Health":"healthy"}\n'),
                               SimpleNamespace(stdout='127.0.0.1:18080')]
        response = io.BytesIO(b'{"status":"UP"}')
        response.status = 200
        opener.return_value.open.return_value = response
        with patch('sys.stdout', new_callable=io.StringIO):
            app.verify_health()
        opener.return_value.open.assert_called_once_with('http://localhost:18080/actuator/health', timeout=5)


if __name__ == '__main__':
    unittest.main()
