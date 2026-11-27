"""Offline manifest checks. Run with: python tests/test_chart.py --helm PATH"""
import argparse
from pathlib import Path
import subprocess
import unittest
import yaml

parser = argparse.ArgumentParser()
parser.add_argument('--helm', default='helm')
options, unittest_args = parser.parse_known_args()
chart = Path(__file__).resolve().parents[1]


def render(environment='dev', extra=()):
    result = subprocess.run([
        options.helm, 'template', 'address-change-db-backup', str(chart),
        '--namespace', 'backup-fixture', '-f', str(chart / f'environments/{environment}.yaml'),
        *extra,
    ], capture_output=True, text=True)
    if result.returncode:
        raise AssertionError(result.stderr)
    # Never print the render: it contains generated credential material.
    return [item for item in yaml.safe_load_all(result.stdout) if item]


class BackupChartTests(unittest.TestCase):
    def test_environment_schedule_credentials_and_retention(self):
        for name, retention in [('dev', ('6', '1', '0')), ('test', ('6', '1', '0')), ('prod', ('6', '1', '0'))]:
            with self.subTest(environment=name):
                objects = render(name)
                deployment = next(x for x in objects if x['kind'] == 'Deployment')
                self.assertEqual(deployment['spec']['replicas'], 1)
                self.assertEqual(deployment['spec']['strategy']['type'], 'Recreate')
                container = deployment['spec']['template']['spec']['containers'][0]
                env = {x['name']: x for x in container['env']}
                self.assertEqual(env['TZ']['value'], 'America/Vancouver')
                self.assertEqual(env['ENVIRONMENT_NAME']['value'], name.upper())
                self.assertEqual(tuple(env[x]['value'] for x in ['DAILY_BACKUPS', 'WEEKLY_BACKUPS', 'MONTHLY_BACKUPS']), retention)
                self.assertEqual(env['DATABASE_USER']['valueFrom']['secretKeyRef'], {'name': 'address-change-db-backup', 'key': 'username'})
                self.assertEqual(env['DATABASE_PASSWORD']['valueFrom']['secretKeyRef'], {'name': 'address-change-db-backup', 'key': 'password'})
                config = next(x for x in objects if x['kind'] == 'ConfigMap')['data']['backup-file']
                lines = config.strip().splitlines()
                jobs = [x for x in lines if '* * *' in x]
                self.assertEqual(len(jobs), 2)
                self.assertTrue(jobs[0].startswith('0 3 * * *'))
                self.assertTrue(jobs[1].startswith('0 6 * * *'))
                self.assertIn('PGSSLMODE=require', jobs[0])
                self.assertTrue(all('flock -n /backups/.operation.lock' in x for x in jobs))
                self.assertIn('verifySchema=address_change', config)
                self.assertNotIn(' -I', config)

    def test_storage_is_separate_and_existing_claims_are_supported(self):
        objects = render()
        pvcs = [x for x in objects if x['kind'] == 'PersistentVolumeClaim']
        self.assertEqual(len(pvcs), 2)
        self.assertEqual({x['spec']['storageClassName'] for x in pvcs}, {'netapp-file-backup', 'netapp-file-standard'})
        objects = render(extra=['--set', 'backup-storage.persistence.backup.claimName=preserved-backups'])
        self.assertEqual(len([x for x in objects if x['kind'] == 'PersistentVolumeClaim']), 1)
        deployment = next(x for x in objects if x['kind'] == 'Deployment')
        claims = [x.get('persistentVolumeClaim', {}).get('claimName') for x in deployment['spec']['template']['spec']['volumes']]
        self.assertIn('preserved-backups', claims)

    def test_policy_selects_actual_backup_and_provisioner_pods(self):
        objects = render()
        policy = next(x for x in objects if x['kind'] == 'NetworkPolicy')
        self.assertEqual(policy['spec']['podSelector']['matchLabels'], {'app.kubernetes.io/name': 'patroni', 'app.kubernetes.io/instance': 'address-change-db'})
        selectors = [x['podSelector']['matchLabels'] for x in policy['spec']['ingress'][0]['from']]
        for kind in ['Deployment', 'Job']:
            labels = next(x for x in objects if x['kind'] == kind)['spec']['template']['metadata']['labels']
            self.assertTrue(any(all(labels.get(k) == v for k, v in selector.items()) for selector in selectors))
        self.assertEqual(policy['spec']['ingress'][0]['ports'], [{'protocol': 'TCP', 'port': 5432}])

    def test_provisioning_uses_admin_secret_without_exposing_it_to_backup(self):
        objects = render()
        job = next(x for x in objects if x['kind'] == 'Job')
        self.assertEqual(job['metadata']['annotations']['helm.sh/hook'], 'post-install,post-upgrade')
        self.assertEqual(job['spec']['activeDeadlineSeconds'], 600)
        self.assertFalse(job['spec']['template']['spec']['automountServiceAccountToken'])
        container = job['spec']['template']['spec']['containers'][0]
        env = {x['name']: x for x in container['env']}
        self.assertEqual(env['PGPASSWORD']['valueFrom']['secretKeyRef']['name'], 'address-change-db-patroni')
        script = container['args'][0]
        self.assertIn('ON_ERROR_STOP=1', script)
        self.assertIn('NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION', script)
        self.assertIn('GRANT pg_read_all_data', script)
        self.assertNotIn('GRANT ALL', script)
        deployment = next(x for x in objects if x['kind'] == 'Deployment')
        references = [x.get('valueFrom', {}).get('secretKeyRef', {}).get('name') for x in deployment['spec']['template']['spec']['containers'][0]['env']]
        self.assertNotIn('address-change-db-patroni', references)

    def test_role_dump_precedes_owned_objects_and_dump_failures_propagate(self):
        import gzip
        import shutil
        import tempfile
        plugin = next(x for x in render() if x['kind'] == 'ConfigMap')['data']['backup.postgres.plugin']
        bash = shutil.which('bash')
        git_bash = Path('C:/Program Files/Git/bin/bash.exe')
        if git_bash.exists():
            bash = str(git_bash)
        self.assertIsNotNone(bash, 'Bash is required for the backup pipeline regression test')
        setup = '''
getHostname() { echo fixture; }
getDatabaseName() { echo address_change; }
getPort() { echo 5432; }
getUsername() { echo address_change_backup; }
getPassword() { echo synthetic-password; }
echoGreen() { :; }
pg_dumpall() { printf 'CREATE ROLE address_change_migration;\nCREATE ROLE address_change_runtime;\nCREATE ROLE address_change_backup;\nCREATE ROLE postgres;\n'; return "${ROLE_STATUS:-0}"; }
pg_dump() { case " $* " in *" --schema=address_change --strict-names "*) ;; *) echo "Unexpected backup scope" >&2; return 66;; esac; printf 'CREATE SCHEMA address_change;\nALTER SCHEMA address_change OWNER TO address_change_migration;\n'; return "${DATA_STATUS:-0}"; }
'''
        # Exercise compressed output and subprocess failures, not just script text.
        for role_status, data_status, expected in [(0, 0, 0), (7, 0, 7), (0, 9, 9)]:
            with self.subTest(role_status=role_status, data_status=data_status):
                with tempfile.TemporaryDirectory() as temporary:
                    output = Path(temporary) / 'backup.sql.gz'
                    # MSYS needs a Unix path when passed as a shell literal.
                    path = output.as_posix()
                    if len(path) > 1 and path[1] == ':':
                        path = '/' + path[0].lower() + path[2:]
                    shell = plugin + '\n' + setup + f'\nROLE_STATUS={role_status}; DATA_STATUS={data_status}\nonBackupDatabase fixture/address_change "{path}"\n'
                    result = subprocess.run([bash, '--noprofile', '--norc', '-s'], input=shell, text=True, capture_output=True)
                    self.assertEqual(result.returncode, expected, result.stderr)
                    if expected == 0:
                        sql = gzip.decompress(output.read_bytes()).decode()
                        self.assertLess(sql.index('CREATE ROLE address_change_migration;'), sql.index('CREATE SCHEMA'))
                        self.assertIn('CREATE ROLE address_change_runtime;', sql)
                        self.assertNotIn('CREATE ROLE address_change_backup;', sql)
                        self.assertNotIn('CREATE ROLE postgres;', sql)
                        self.assertNotIn('CREATE EXTENSION', sql)
                    elif role_status:
                        sql = gzip.decompress(output.read_bytes()).decode()
                        self.assertNotIn('CREATE SCHEMA', sql)


    def test_s3_mode_uses_ephemeral_storage_and_isolates_admin_credentials(self):
        options = ('--set', 'backup-storage.enabled=false',
                   '--set', 's3.endpoint=https://fixture.invalid',
                   '--set', 's3.bucket=fixture')
        objects = render(extra=options)
        self.assertFalse(any(x['kind'] == 'PersistentVolumeClaim' for x in objects))
        pod = next(x for x in objects if x['kind'] == 'Deployment')['spec']['template']['spec']
        self.assertEqual(sum('emptyDir' in volume for volume in pod['volumes']), 3)
        env = {entry['name']: entry for entry in pod['containers'][0]['env']}
        for key in ('AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'):
            self.assertEqual(env[key]['valueFrom']['secretKeyRef'],
                             {'name': 'address-change-db-s3', 'key': key})
        self.assertNotIn('RECOVERY_PASSWORD', env)
        self.assertFalse(any('-recover-' in x['metadata']['name'] for x in objects))

        objects = render(extra=(*options, '--set', 'recovery.enabled=true',
                                '--set', 'recovery.database=address_change_recovered',
                                '--set', 'recovery.object=known-good.sql.gz'))
        job = next(x for x in objects if '-recover-' in x['metadata']['name'])
        env = {entry['name']: entry for entry in job['spec']['template']['spec']['containers'][0]['env']}
        self.assertEqual(env['RECOVERY_DATABASE']['value'], 'address_change_recovered')
        self.assertEqual(env['RECOVERY_PASSWORD']['valueFrom']['secretKeyRef']['name'],
                         'address-change-db-patroni')
        self.assertEqual(job['spec']['backoffLimit'], 0)

    def test_webhook_uses_existing_secret(self):
        objects = render(extra=['--set', 'backup-storage.env.WEBHOOK_URL.secure=false', '--set', 'backup-storage.env.WEBHOOK_URL.existingSecret.name=backup-alerts', '--set', 'backup-storage.env.WEBHOOK_URL.existingSecret.key=url'])
        deployment = next(x for x in objects if x['kind'] == 'Deployment')
        env = {x['name']: x for x in deployment['spec']['template']['spec']['containers'][0]['env']}
        self.assertEqual(env['WEBHOOK_URL']['valueFrom']['secretKeyRef'], {'name': 'backup-alerts', 'key': 'url'})


if __name__ == '__main__':
    unittest.main(argv=[__file__, *unittest_args])
