# Working in Address Change API

Read [.agents/INDEX.md](.agents/INDEX.md) first. Use it to locate information and decide where changes belong. Maintain its paths and short descriptions whenever important files or folders are added, moved, removed, or change purpose.

Scan [.agents/RULES.md](.agents/RULES.md), then read an individual rule only when its name and description indicate it is relevant to the current task. Do not load all rule documents by default. Read supporting resources only as needed. Each rule has a name and short description in the catalog, with its own Markdown document and optional supporting resources under `.agents/rules/<rule>/`. Maintain the catalog when rules change.

For post-clone local setup, use [.agents/skills/initialize-project/SKILL.md](.agents/skills/initialize-project/SKILL.md). It creates a missing `.env` from the template, guides field entry or applies explicitly approved values, and recommends Start/Restart after setup.

For start/restart requests, use [.agents/skills/start-restart/SKILL.md](.agents/skills/start-restart/SKILL.md).

For changes, consult the verification rule for the affected files. Use Docker Compose for local development through `python tools/app.py`. Keep repeatable lifecycle mechanics in scripts; skills should invoke scripts, handle approvals, and summarize results. Use the checked-in Maven Wrapper for builds.

When delegating, specify the bounded task, relevant paths, constraints, and expected evidence or deliverable. Avoid delegation when coordination costs more than completing the work directly. The primary agent integrates results and resolves conflicting recommendations.

Recommend `gpt-luna-6` sub-agents for bounded tasks that do not need advanced reasoning, such as running the Start/Restart skill, routine checks, and small documentation updates. The currently available model identifier for this recommendation is `gpt-6-luna`; use that identifier when required by the tool. Delegate only when it helps; keep architecture, ambiguous failures, and substantive design decisions with the primary agent. If the recommended model is unavailable, use an available model and state the substitution.

Do NOT update README.md without approval.
