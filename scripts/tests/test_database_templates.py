"""Offline deployment checks: python scripts/tests/test_database_templates.py.

Requires PyYAML and the OpenShift CLI. No cluster login or credentials are used.
"""
import json
from pathlib import Path
import shutil
import subprocess
import unittest

import yaml

ROOT = Path(__file__).resolve().parents[2]
OC = shutil.which('oc')


def render(path, **parameters):
    result = subprocess.run(
        [OC, 'process', '--local', '-f', str(ROOT / path), '-o', 'json',
         *[f'-p={key}={value}' for key, value in parameters.items()]],
        capture_output=True, text=True, check=True,
    )
    return json.loads(result.stdout)['items']


def backend(environment):
    patroni = environment in ('test', 'prod')
    disposable = f'address-change-{environment}-database'
    return render(
        'backend/openshift.deploy.yml', NAME='address-change', ZONE=environment,
        IMAGE_TAG='fixture', DB_HOST='address-change-db-patroni' if patroni else disposable,
        DB_NAME='address_change' if patroni else 'app',
        DB_RUNTIME_SECRET='address-change-db-runtime' if patroni else disposable,
        DB_MIGRATION_SECRET='address-change-db-migration' if patroni else disposable,
        DB_USERNAME_KEY='username' if patroni else 'database-user',
        DB_PASSWORD_KEY='password' if patroni else 'database-password',
        DB_SSLMODE='require' if patroni else 'disable',
        DB_CLIENT='address-change' if patroni else 'disposable',
    )[0]['spec']['template']


def env(container):
    return {item['name']: item for item in container['env']}


@unittest.skipUnless(OC, 'OpenShift CLI is required')
class DatabaseTemplates(unittest.TestCase):
    def test_patroni_credentials_and_schema(self):
        for target in ('test', 'prod'):
            with self.subTest(target=target):
                pod = backend(target)
                runtime = env(pod['spec']['containers'][0])
                migration = env(pod['spec']['initContainers'][1])
                self.assertEqual(runtime['POSTGRES_HOST']['value'], 'address-change-db-patroni')
                self.assertEqual(runtime['POSTGRES_DATABASE']['value'], 'address_change')
                self.assertEqual(runtime['POSTGRES_SCHEMA']['value'], 'address_change')
                self.assertEqual(runtime['POSTGRES_SSLMODE']['value'], 'require')
                self.assertEqual(migration['FLYWAY_DEFAULT_SCHEMA']['value'], 'address_change')
                self.assertIn('?sslmode=require', migration['FLYWAY_URL']['value'])
                self.assertEqual(runtime['POSTGRES_PASSWORD']['valueFrom']['secretKeyRef'],
                                 {'name': 'address-change-db-runtime', 'key': 'password'})
                self.assertEqual(migration['FLYWAY_PASSWORD']['valueFrom']['secretKeyRef'],
                                 {'name': 'address-change-db-migration', 'key': 'password'})
                self.assertEqual(pod['metadata']['labels']['database-client'], 'address-change')
                self.assertNotIn('address-change-db-migration', json.dumps(pod['spec']['containers']))
                self.assertNotIn('address-change-db-patroni', json.dumps(runtime['POSTGRES_PASSWORD']))
                self.assertIn('address-change-db-patroni 5432',
                              pod['spec']['initContainers'][0]['command'][-1])

    def test_pr_database_remains_isolated(self):
        pod = backend('123')
        runtime = env(pod['spec']['containers'][0])
        migration = env(pod['spec']['initContainers'][1])
        self.assertEqual(runtime['POSTGRES_HOST']['value'], 'address-change-123-database')
        self.assertEqual(runtime['POSTGRES_DATABASE']['value'], 'app')
        self.assertEqual(runtime['POSTGRES_SCHEMA']['value'], 'address_change')
        self.assertEqual(runtime['POSTGRES_SSLMODE']['value'], 'disable')
        self.assertEqual(runtime['POSTGRES_PASSWORD']['valueFrom']['secretKeyRef'],
                         {'name': 'address-change-123-database', 'key': 'database-password'})
        self.assertEqual(migration['FLYWAY_USER']['valueFrom']['secretKeyRef'],
                         {'name': 'address-change-123-database', 'key': 'database-user'})
        self.assertEqual(pod['metadata']['labels']['database-client'], 'disposable')
        self.assertNotIn('address-change-db-runtime', json.dumps(pod))

    def test_common_init_owns_only_application_policies(self):
        objects = render('common/openshift.init.yml', NAME='address-change', ZONE='test')
        self.assertEqual([obj['kind'] for obj in objects], ['NetworkPolicy', 'NetworkPolicy'])

    def test_disposable_resources_retain_cleanup_labels(self):
        objects = render('common/openshift.database-init.yml', NAME='address-change',
                         ZONE='123', DB_PASSWORD='offline-fixture')
        secret = next(obj for obj in objects if obj['kind'] == 'Secret')
        self.assertEqual(secret['stringData']['database-name'], 'app')
        self.assertEqual(secret['metadata']['labels']['app'], 'address-change-123')
        objects = render('common/openshift.database.yml', NAME='address-change', ZONE='123')
        self.assertEqual({obj['kind'] for obj in objects}, {'StatefulSet', 'Service'})
        database = next(obj for obj in objects if obj['kind'] == 'StatefulSet')
        container = database['spec']['template']['spec']['containers'][0]
        self.assertEqual(container['image'], 'postgres:18.6')
        self.assertEqual(env(container)['PGDATA']['value'], '/var/lib/postgresql/data/pgdata')
        self.assertIn('/var/lib/postgresql/data', [mount['mountPath'] for mount in container['volumeMounts']])
        self.assertTrue(all(obj['metadata']['labels']['app'] == 'address-change-123'
                            for obj in objects))

    def test_workflow_keeps_database_job_conditional(self):
        workflow = yaml.safe_load((ROOT / '.github/workflows/reusable-deploy.yml').read_text(encoding='utf-8'))
        jobs = workflow['jobs']
        self.assertEqual(jobs['database']['if'],
                         "inputs.environment != 'test' && inputs.environment != 'prod'")
        self.assertEqual(jobs['deploy']['strategy']['matrix']['name'], ['backend', 'frontend'])
        self.assertIn("needs.database.result == 'skipped'", jobs['deploy']['if'])
        for path in ('merge.yml', 'release.yml'):
            self.assertNotIn('db_password:', (ROOT / '.github/workflows' / path).read_text(encoding='utf-8'))


if __name__ == '__main__':
    unittest.main()
