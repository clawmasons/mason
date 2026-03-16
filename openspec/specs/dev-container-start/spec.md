## ADDED Requirements

### Requirement: `--dev-container` flag on `mason run`
The CLI SHALL accept a `--dev-container` flag on the `mason run --agent <type> --role <role>` command. When present, mason SHALL start the agent session using the existing docker compose session flow (proxy + agent containers) and then enter dev-container post-start mode instead of following interactive agent mode.

#### Scenario: Flag accepted and session starts
- **WHEN** the user runs `mason run --agent claude --dev-container --role engineering`
- **THEN** mason starts the proxy and agent containers via docker compose as normal and proceeds to print dev-container connection instructions

#### Scenario: Flag absent — no change to existing behavior
- **WHEN** the user runs `mason run --agent claude --role engineering` without `--dev-container`
- **THEN** mason behaves identically to the current interactive agent mode with no dev-container logic applied

---

### Requirement: Print IDE connection instructions after container start
After the agent container is running and healthy, mason SHALL print connection instructions to stdout explaining how to attach any dev-container-compatible IDE to the running container. Mason SHALL NOT launch any IDE automatically at this point.

#### Scenario: Instructions printed on successful start
- **WHEN** the agent container starts successfully in dev-container mode
- **THEN** mason prints the container name, workspace path, and step-by-step instructions for attaching VSCode or another dev-container-compatible IDE

#### Scenario: Instructions include container name
- **WHEN** connection instructions are printed
- **THEN** the instructions include the exact container name needed for IDE attachment (e.g. the docker compose service container name)

---

### Requirement: Mason stays alive as credential service host
In dev-container mode, mason SHALL remain running after printing connection instructions to continue owning the credential proxy lifecycle. Mason SHALL tear down the session (stop containers, clean up) when the user sends Ctrl+C (SIGINT).

#### Scenario: Mason stays running after instructions printed
- **WHEN** connection instructions have been printed
- **THEN** mason does not exit and continues to run in the foreground

#### Scenario: Ctrl+C tears down session
- **WHEN** the user presses Ctrl+C while mason is running in dev-container mode
- **THEN** mason stops the agent and proxy containers and exits cleanly

---

### Requirement: Persistent VS Code Server volume created before container start
Before starting docker compose, mason SHALL ensure the host directory `.mason/docker/vscode-server/` exists within the project directory. This directory is mounted into the agent container at `/home/mason/.vscode-server` to persist the VS Code Server binary and installed extensions.

#### Scenario: Directory created if absent
- **WHEN** `mason run --dev-container` is invoked and `.mason/docker/vscode-server/` does not exist
- **THEN** mason creates the directory before running docker compose

#### Scenario: Directory already exists — no error
- **WHEN** `mason run --dev-container` is invoked and `.mason/docker/vscode-server/` already exists
- **THEN** mason proceeds without error and does not modify the directory contents
