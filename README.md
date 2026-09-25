# Address Change API

![Status](https://img.shields.io/badge/Status-Under%20Development-orange)

## Getting Started

Prerequisites: Docker with Compose v2.20+ and a running daemon, plus Python 3.10+ for the lifecycle helper. Host Java and Maven installations are not needed.

1. Clone the repository with `git clone https://github.com/bcgov/address-change.git`

2. Ask your agent to use `$initialize-project`, or open the [Initialize Project skill](.agents/skills/initialize-project/SKILL.md). It creates `.env` from `.env.example` if missing, preserves existing configuration, and explains which fields your startup method needs. You can edit the fields yourself or approve proposed values for the agent to fill in. After validation it recommends `$start-restart` to start the application and check health.
