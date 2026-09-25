---
name: initialize-project
description: Prepare Address Change API after cloning by checking Docker Compose and Python, creating a missing .env, and guiding or applying approved settings before recommending Start/Restart.
---

# Initialize Project

Read `AGENTS.md`, `.agents/INDEX.md`, the rule catalog, `.env.example`, and the README setup section. Load individual rules only when relevant. Locate the actual checkout without fixed paths or user names. Use Docker Compose for local development; host Java and Maven are not required.

## Check prerequisites

Check Python 3.10+ and run `python tools/app.py check` (or `python3`). The helper checks Docker, the running daemon, Compose, and configuration. Require Compose v2.20+ for the lifecycle workflow. On Windows use an environment with access to Docker, either native or WSL; discover its checkout path rather than assuming it. Explain missing prerequisites without automatically installing software. These checks do not start the application or prove health.

## Prepare configuration

If root `.env` is missing, create it unchanged from `.env.example` using an exclusive/no-overwrite operation. Invoking this skill authorizes that template copy. Preserve existing files, comments, and unrelated settings; never replace an existing `.env` wholesale. Confirm it is ignored and untracked by Git. If tracked, report the problem and agree on remediation rather than silently changing tracking.

Offer to guide the user as they edit the fields or to apply a concrete proposal after approval. The current field is `SERVER_PORT`, an integer from 1 to 65535 with default 8080. Compose maps it to container port 8080. Check the chosen port without stopping listeners; an existing container belonging to this project may already use it. If another application occupies it, propose an available alternative. Host JAVA_HOME and MAVEN_HOME are unnecessary; preserve any legacy local entries but do not add them to new files.

Use the current template as the field inventory. Inspect only necessary values and never dump the entire `.env` or disclose secrets. Shell variables override `.env`; report relevant overrides without exposing unrelated environment values. Treat configuration as data, never source or evaluate it.

## Guide or obtain approval

For self-editing, explain the field and wait for the user's completion before validation. For assisted editing, present exact proposed non-secret fields and values and whether each is added or changed. Ask for explicit approval to apply that concrete proposal, explaining that this skill's user-requested workflow requires it. Silence is not approval. Existing explicit approval for those exact changes is sufficient; do not ask again.

After approval, re-check the file and change only approved fields, preserving intervening edits and unrelated content. Do not put personal values in tracked files. Use simple KEY=value lines compatible with the template.

## Validate and hand off

Check the configured and effective port, confirm `.env` is ignored/untracked, and run `python tools/app.py check` again only if configuration changed since the previous successful check. Avoid printing resolved Compose configuration. Report blockers accurately; claim setup complete only after required checks pass.

After successful setup recommend the [Start/Restart skill](../start-restart/SKILL.md): Use $start-restart to start the application with Docker Compose and verify health. Leave the application stopped unless startup was explicitly requested; if requested, continue with that skill.
