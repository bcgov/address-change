# Verification by change type

Run checks that exercise the changed behavior. Reuse successful results when nothing relevant changed; do not repeat full suites for documentation edits.

| Change | Checks |
| --- | --- |
| Documentation, index, rules | `python tools/check_index.py`; check modified relative Markdown links and `git diff --check`. Python 3.10+ is required for the index checker. |
| API or Maven configuration | `python tools/app.py test`, or `./mvnw -f api/pom.xml clean verify` with a host JDK. |
| Lifecycle scripts | `python -m py_compile tools/app.py` and `bash -n tools/app.sh`; exercise changed behavior, including failure paths, in isolated fixtures or on a spare port. |
| Index checker | `python -m unittest discover -s tools -p 'test_*.py'` and `python tools/check_index.py`. |
| Compose or development image | `docker compose config --quiet`; build/start and verify readiness and container health. Preserve pre-existing services and data. |
| Skills | Validate frontmatter and references using the available skill validator; check the workflow against the actual scripts and commands. |

Report what passed, what was not run, and concrete blockers. A running process is not evidence of API readiness. New tests should cover observable behavior or a regression, not duplicate implementation details.
