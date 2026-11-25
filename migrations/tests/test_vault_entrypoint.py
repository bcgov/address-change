"""Offline checks for the Flyway credential wrapper. Requires jq on PATH."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

WRAPPER = Path(__file__).resolve().parents[1] / 'vault-entrypoint.sh'


class VaultEntrypointTests(unittest.TestCase):
    def invoke(self, contents, enabled='true'):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            credentials = root / 'credentials.json'
            credentials.write_text(contents)
            flyway = root / 'flyway'
            flyway.write_text(
                '#!/bin/sh\n'
                'test "$FLYWAY_USER" = "$EXPECTED_USER" && '
                'test "$FLYWAY_PASSWORD" = "$EXPECTED_PASSWORD" && '
                'test "$1" = "info"\n'
            )
            flyway.chmod(0o755)
            wrapper = root / 'entrypoint.sh'
            wrapper.write_text(WRAPPER.read_text()
                               .replace('/vault/secrets/db-migration.json', str(credentials))
                               .replace('/flyway/flyway', str(flyway)))
            password = 'fixture "$() password'
            return subprocess.run(
                ['sh', str(wrapper), 'info'], capture_output=True, text=True,
                env={**os.environ, 'VAULT_DATABASE_ENABLED': enabled,
                     'FLYWAY_USER': 'legacy', 'FLYWAY_PASSWORD': 'legacy',
                     'EXPECTED_USER': 'migration' if enabled == 'true' else 'legacy',
                     'EXPECTED_PASSWORD': password if enabled == 'true' else 'legacy'},
            )

    def test_vault_overrides_legacy_credentials(self):
        result = self.invoke(json.dumps(
            {'username': 'migration', 'password': 'fixture "$() password'}))
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_pr_uses_existing_credentials_without_vault(self):
        self.assertEqual(self.invoke('not JSON', enabled='false').returncode, 0)

    def test_invalid_vault_data_fails_without_leaking_input(self):
        for contents in ['{"password":"sensitive-fixture" BROKEN}', '{}',
                         '{"username":"migration","password":42}']:
            result = self.invoke(contents)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(result.stderr.strip(), 'Missing or invalid Vault migration credentials')


if __name__ == '__main__':
    unittest.main()
