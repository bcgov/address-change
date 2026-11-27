"""Offline chart/version checks. Requires Python, PyYAML, Helm and Bash."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

import yaml

parser = argparse.ArgumentParser()
parser.add_argument('--helm', default='helm')
options, remaining = parser.parse_known_args()
CHART = Path(__file__).resolve().parents[1]


def render(chart=CHART, extra=()):
    result = subprocess.run([options.helm, 'template', 'address-change-db', str(chart),
                             '--namespace', 'version-fixture', *extra],
                            capture_output=True, text=True, check=True)
    # Generated Secrets must never be printed by these checks.
    return [obj for obj in yaml.safe_load_all(result.stdout) if obj]


class PostgreSQLVersionTests(unittest.TestCase):
    def test_database_image_major_and_hook_client_match(self):
        objects = render()
        pod = next(obj for obj in objects if obj['kind'] == 'StatefulSet')['spec']['template']['spec']
        container = pod['containers'][0]
        self.assertEqual(container['image'], 'ghcr.io/zalando/spilo-18:4.1-p2')
        env = {item['name']: item['value'] for item in container['env'] if 'value' in item}
        self.assertEqual(env['PGVERSION'], '18')
        hook = next(obj for obj in objects if obj['kind'] == 'Job')
        self.assertEqual(hook['spec']['template']['spec']['containers'][0]['image'], 'postgres:18.6-alpine')
        guard = pod['initContainers'][0]
        self.assertEqual(guard['image'], container['image'])
        self.assertTrue(guard['volumeMounts'][0]['readOnly'])

    def test_bootstrap_and_backup_clients_match(self):
        for chart in ['address-change-db-bootstrap', 'address-change-db-backup']:
            with self.subTest(chart=chart):
                job = next(obj for obj in render(CHART.parent / chart) if obj['kind'] == 'Job')
                self.assertEqual(job['spec']['template']['spec']['containers'][0]['image'], 'postgres:18.6-alpine')

    def test_guard_reads_overridden_data_path(self):
        objects = render(extra=['--set', 'env.PGROOT=/custom/root', '--set', 'env.PGDATA=/custom/data'])
        guard = next(obj for obj in objects if obj['kind'] == 'StatefulSet')['spec']['template']['spec']['initContainers'][0]
        env = {item['name']: item['value'] for item in guard['env']}
        self.assertEqual(env, {'PGROOT': '/custom/root', 'PGDATA': '/custom/data', 'EXPECTED_PG_VERSION': '18'})

    def test_volume_guard_preserves_old_data_and_allows_fresh_or_matching_data(self):
        objects = render()
        guard = next(obj for obj in objects if obj['kind'] == 'StatefulSet')['spec']['template']['spec']['initContainers'][0]
        bash = shutil.which('bash')
        git_bash = Path('C:/Program Files/Git/bin/bash.exe')
        if git_bash.exists():
            bash = str(git_bash)
        self.assertIsNotNone(bash, 'Bash is required to execute the volume guard')
        for directory, version, expected in [('data', None, 0), ('data', '18', 0), ('data', '15', 1), ('data', '17', 1), ('pgdata', '15', 1)]:
            with self.subTest(directory=directory, version=version):
                with tempfile.TemporaryDirectory() as temporary:
                    pgroot = Path(temporary)
                    version_file = pgroot / directory / 'PG_VERSION'
                    if version:
                        version_file.parent.mkdir(parents=True)
                        version_file.write_text(version + '\n')
                    path = pgroot.as_posix()
                    if len(path) > 1 and path[1] == ':':
                        path = '/' + path[0].lower() + path[2:]
                    result = subprocess.run([bash, '--noprofile', '--norc', '-ec', guard['args'][0]],
                                            env={**os.environ, 'PGROOT': path, 'PGDATA': path + '/data', 'EXPECTED_PG_VERSION': '18'},
                                            capture_output=True, text=True)
                    self.assertEqual(result.returncode, expected, result.stderr)
                    if version:
                        self.assertEqual(version_file.read_text(), version + '\n')


if __name__ == '__main__':
    unittest.main(argv=[__file__, *remaining])
