"""Check repository paths in the project index; generated rows are optional."""

from pathlib import Path
import re
import sys


def check_index(root: Path) -> list[str]:
    errors = []
    index = root / '.agents/INDEX.md'
    rows = re.findall(r'^\|\s*`([^`]+)`\s*([^|]*)\|', index.read_text(encoding='utf-8'), re.M)
    if not rows:
        return ['The index has no path rows.']
    seen = set()
    for name, annotation in rows:
        if name in seen:
            errors.append(f'Duplicate index path: {name}')
        seen.add(name)
        path = (root / name).resolve()
        if Path(name).is_absolute() or not path.is_relative_to(root.resolve()):
            errors.append(f'Index path must stay inside the repository: {name}')
        elif 'generated' not in annotation and not path.exists():
            errors.append(f'Missing indexed path: {name}')
    return errors


if __name__ == '__main__':
    errors = check_index(Path(__file__).resolve().parents[1])
    for error in errors:
        print(error, file=sys.stderr)
    if errors:
        sys.exit(1)
    print('Project index paths are valid.')
