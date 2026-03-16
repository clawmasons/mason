## MODIFIED Requirements

### Requirement: `LABEL devcontainer.metadata` injected into agent Dockerfile at build time
The agent image build process SHALL inject a `LABEL devcontainer.metadata` instruction into the agent's Dockerfile. The label value SHALL be a JSON array containing a single object with:
- `"remoteUser"`: `"mason"`
- `"workspaceFolder"`: `"/home/mason/workspace/project"` for `role.type === "project"` (or unset), or `"/home/mason/workspace"` for `role.type === "supervisor"`
- `"customizations"`: the resolved `dev-container-customizations` object (compact JSON, no extra whitespace)

The resulting label for a project role SHALL conform to:

```dockerfile
LABEL devcontainer.metadata='[{"remoteUser":"mason","workspaceFolder":"/home/mason/workspace/project","customizations":{...}}]'
```

The resulting label for a supervisor role SHALL conform to:

```dockerfile
LABEL devcontainer.metadata='[{"remoteUser":"mason","workspaceFolder":"/home/mason/workspace","customizations":{...}}]'
```

#### Scenario: Project role label uses project workspaceFolder
- **WHEN** the agent image is built for a Role with `type === "project"` (or unset)
- **THEN** the built image contains a `devcontainer.metadata` label with `"workspaceFolder": "/home/mason/workspace/project"`

#### Scenario: Supervisor role label uses workspace workspaceFolder
- **WHEN** the agent image is built for a Role with `type === "supervisor"`
- **THEN** the built image contains a `devcontainer.metadata` label with `"workspaceFolder": "/home/mason/workspace"`

#### Scenario: IDE attach lands in correct directory
- **WHEN** a dev-container-compatible IDE attaches to a running supervisor agent container
- **THEN** the IDE SHALL open at `/home/mason/workspace`, not the project subdirectory

#### Scenario: Label injected with resolved customizations
- **WHEN** the agent image is built and `dev-container-customizations` is resolved (explicit or default)
- **THEN** the built image contains a `devcontainer.metadata` label with the correct JSON value

#### Scenario: IDE reads label and installs extensions on attach
- **WHEN** a dev-container-compatible IDE (e.g. VSCode) attaches to the running agent container
- **THEN** the IDE reads the `devcontainer.metadata` label, installs the listed extensions inside the container, and applies the specified settings

#### Scenario: Customizations change requires image rebuild
- **WHEN** `dev-container-customizations` is modified in `.mason/config.json`
- **THEN** the agent image MUST be rebuilt for the change to take effect; no runtime mechanism updates the label
