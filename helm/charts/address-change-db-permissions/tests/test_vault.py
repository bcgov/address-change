"""Offline Vault integration checks. Build the three charts' dependencies first."""
from pathlib import Path
import base64
import re
import subprocess
import unittest
import yaml

CHARTS = Path(__file__).resolve().parents[2]
VAULT = ['--set', 'vault.enabled=true', '--set', 'vault.role=fixture-nonprod',
         '--set', 'vault.databasePath=secret/data/database',
         '--set', 'vault.s3Path=secret/data/s3']
S3 = ['--set', 'backup-storage.enabled=false', '--set', 's3.endpoint=https://fixture.invalid',
      '--set', 's3.bucket=fixture']


def render(chart, extra=()):
    result = subprocess.run(['helm', 'template', 'address-change-db', str(CHARTS / chart),
                             *VAULT, *extra], capture_output=True, text=True, check=True)
    return [item for item in yaml.safe_load_all(result.stdout) if item]


def pod(resource):
    return resource['spec']['template']


class VaultTests(unittest.TestCase):
    def test_bootstrap_uses_only_vault_credentials(self):
        objects = render('address-change-db-bootstrap')
        self.assertFalse(any(item['kind'] == 'Secret' for item in objects))
        job = next(item for item in objects if item['kind'] == 'Job')
        spec = pod(job)
        container = spec['spec']['containers'][0]
        self.assertEqual(spec['spec']['serviceAccountName'], 'b5cfc6-vault')
        self.assertNotIn('secretKeyRef', str(container))
        self.assertIn('. /vault/secrets/env-0.sh', container['args'][0])
        paths = [v for k, v in spec['metadata']['annotations'].items()
                 if k.startswith('vault.hashicorp.com/agent-inject-secret-')]
        self.assertEqual(set(paths), {'secret/data/database/patroni-superuser',
                                     'secret/data/database/migration',
                                     'secret/data/database/runtime'})

    def test_backup_pod_has_no_administrative_credentials(self):
        objects = render('address-change-db-backup', S3)
        self.assertFalse(any(item['kind'] == 'Secret' for item in objects))
        deployment = next(item for item in objects if item['kind'] == 'Deployment')
        spec = pod(deployment)
        self.assertNotIn('secretKeyRef', str(spec['spec']['containers']))
        self.assertNotIn('patroni-superuser', str(spec['metadata']['annotations']))
        self.assertIn('secret/data/database/backup', str(spec['metadata']['annotations']))
        self.assertIn('secret/data/s3', str(spec['metadata']['annotations']))

    def test_recovery_uses_vault_roles_and_admin_credentials(self):
        objects = render('address-change-db-backup', [*S3, '--set', 'recovery.enabled=true',
                                                     '--set', 'recovery.database=recovered'])
        job = next(item for item in objects if item['kind'] == 'Job' and '-recover-' in item['metadata']['name'])
        self.assertNotIn('secretKeyRef', str(pod(job)['spec']['containers']))
        self.assertIn('patroni-superuser', str(pod(job)['metadata']['annotations']))
        self.assertIn('MIGRATION_ROLE', str(pod(job)['metadata']['annotations']))

    def test_patroni_preserves_coordination_access_during_transition(self):
        objects = render('patroni')
        stateful = next(item for item in objects if item['kind'] == 'StatefulSet')
        self.assertEqual(pod(stateful)['spec']['serviceAccountName'], 'b5cfc6-vault')
        self.assertNotIn('secretKeyRef', str(pod(stateful)['spec']['containers']))
        self.assertIn('exec /bin/sh /launch.sh init', str(pod(stateful)['spec']['containers']))
        binding = next(item for item in objects if item['kind'] == 'RoleBinding')
        self.assertEqual({subject['name'] for subject in binding['subjects']},
                         {'b5cfc6-vault', 'address-change-db-patroni'})
        self.assertFalse(any(item['kind'] == 'Secret' for item in objects))

    def test_patroni_migration_retains_the_actual_legacy_account(self):
        for create, name, expected in [(False, '', 'default'),
                                       (False, 'existing-patroni', 'existing-patroni'),
                                       (True, '', 'address-change-db-patroni'),
                                       (True, 'custom-patroni', 'custom-patroni')]:
            with self.subTest(create=create, name=name):
                objects = render('patroni', ['--set', f'serviceAccount.create={str(create).lower()}',
                                             '--set-string', f'serviceAccount.name={name}'])
                binding = next(item for item in objects if item['kind'] == 'RoleBinding')
                self.assertEqual({subject['name'] for subject in binding['subjects']},
                                 {'b5cfc6-vault', expected})
                accounts = [item['metadata']['name'] for item in objects
                            if item['kind'] == 'ServiceAccount']
                self.assertEqual(accounts, [expected] if create else [])

    def test_rendered_shell_preserves_special_characters_and_trailing_newlines(self):
        objects = render('address-change-db-bootstrap')
        job = next(item for item in objects if item['kind'] == 'Job')
        template = pod(job)['metadata']['annotations']['vault.hashicorp.com/agent-inject-template-env-0.sh']
        # Simulate only the base64 substitutions performed by Vault on string fields.
        fixture = 'synthetic "$() quote\' value\n\n'
        encoded = base64.b64encode(fixture.encode()).decode()
        script = re.sub(r'{{ index .*? }}', encoded, template)
        script = re.sub(r'{{.*?}}', '', script)
        result = subprocess.run(['sh', '-ec', script + '\nprintf "%s" "$PGPASSWORD"'],
                                capture_output=True, text=True, check=True)
        self.assertEqual(result.stdout, fixture)
        subprocess.run(['sh', '-n'], input=script, text=True, check=True)


if __name__ == '__main__':
    unittest.main()
