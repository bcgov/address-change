"""Behavior checks for stale paths and optional generated output."""

from pathlib import Path
import tempfile
import unittest

from check_index import check_index


class IndexTests(unittest.TestCase):
    def check(self, rows):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / '.agents').mkdir()
            (root / 'README.md').touch()
            (root / '.agents/INDEX.md').write_text(rows, encoding='utf-8')
            return check_index(root)

    def test_existing_and_generated_paths(self):
        self.assertEqual([], self.check('| `README.md` | Docs |\n| `target/` (generated, ignored) | Build |'))

    def test_stale_path(self):
        self.assertEqual(['Missing indexed path: missing.md'], self.check('| `missing.md` | Docs |'))

    def test_duplicates_and_escape(self):
        self.assertEqual(2, len(self.check('| `README.md` | Docs |\n| `README.md` | Docs |\n| `../outside` | Invalid |')))

    def test_empty_index(self):
        self.assertTrue(self.check('# Empty'))


if __name__ == '__main__':
    unittest.main()
