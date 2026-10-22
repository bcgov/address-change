# GitHub workflows

- PR deploys run through `workflows/reusable-deploy.yml`; tests through `workflows/reusable-tests.yml`.
- Use the `github-actions` skill when authoring or reviewing workflows.
- Use bcgov shared actions and workflows (`bcgov/action-*`, `bcgov/actions/*`, `bcgov/actions-openshift/*`, `bcgov/quickstart-openshift-helpers`) as provided; don't copy or fork them.
- Never pin `@main`. Pin bcgov shared actions to a published release SHA with a `# vX.Y.Z` comment.
- Vanity Route TLS (`bcgov/actions-openshift/route-tls`) is managed only by the standalone on-demand `workflows/route-tls.yml` (`workflow_dispatch`). Never embed it in `merge.yml`, `release.yml`, or continuous deployment pipelines.
