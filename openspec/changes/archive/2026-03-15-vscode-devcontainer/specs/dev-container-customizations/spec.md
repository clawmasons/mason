## ADDED Requirements

### Requirement: `dev-container-customizations` field in agent config
Each agent entry in `.mason/config.json` SHALL support an optional `dev-container-customizations` field. The field structure SHALL follow the dev container spec customizations format, with a `vscode` key containing `extensions` (array of extension IDs) and `settings` (key-value object).

If `dev-container-customizations` is absent from an agent's config entry, the following default SHALL be used:

```json
{
  "vscode": {
    "extensions": [
      "anthropic.claude-code",
      "dbaeumer.vscode-eslint",
      "esbenp.prettier-vscode",
      "yoavbls.pretty-ts-errors",
      "usernamehw.errorlens",
      "eamodio.gitlens",
      "editorconfig.editorconfig"
    ],
    "settings": {
      "terminal.integrated.defaultProfile.linux": "bash"
    }
  }
}
```

#### Scenario: Agent config has explicit customizations
- **WHEN** an agent entry in `.mason/config.json` includes `dev-container-customizations`
- **THEN** the packager uses those customizations when building the agent image

#### Scenario: Agent config omits customizations — default applied
- **WHEN** an agent entry in `.mason/config.json` does not include `dev-container-customizations`
- **THEN** the packager applies the default customizations when building the agent image

---

### Requirement: `LABEL devcontainer.metadata` injected into agent Dockerfile at build time
The agent image build process SHALL inject a `LABEL devcontainer.metadata` instruction into the agent's Dockerfile. The label value SHALL be a JSON array containing a single object with:
- `"remoteUser"`: `"mason"`
- `"workspaceFolder"`: `"/workspace/project"`
- `"customizations"`: the resolved `dev-container-customizations` object (compact JSON, no extra whitespace)

The resulting label SHALL conform to:

```dockerfile
LABEL devcontainer.metadata='[{"remoteUser":"mason","workspaceFolder":"/workspace/project","customizations":{...}}]'
```

#### Scenario: Label injected with resolved customizations
- **WHEN** the agent image is built and `dev-container-customizations` is resolved (explicit or default)
- **THEN** the built image contains a `devcontainer.metadata` label with the correct JSON value

#### Scenario: IDE reads label and installs extensions on attach
- **WHEN** a dev-container-compatible IDE (e.g. VSCode) attaches to the running agent container
- **THEN** the IDE reads the `devcontainer.metadata` label, installs the listed extensions inside the container, and applies the specified settings

#### Scenario: Customizations change requires image rebuild
- **WHEN** `dev-container-customizations` is modified in `.mason/config.json`
- **THEN** the agent image MUST be rebuilt for the change to take effect; no runtime mechanism updates the label

---

### Requirement: Compact JSON serialization in label value
The `customizations` value embedded in the `devcontainer.metadata` label SHALL be compact JSON (no extra whitespace or newlines). The full label value SHALL be valid JSON parseable by a JSON parser.

#### Scenario: Label value is compact JSON
- **WHEN** the label is inspected via `docker inspect --format '{{json .Config.Labels}}'`
- **THEN** the `devcontainer.metadata` value is a valid JSON string parseable without error

#### Scenario: Special characters in extension IDs do not break label
- **WHEN** extension IDs contain dots or hyphens (e.g. `dbaeumer.vscode-eslint`)
- **THEN** the JSON is correctly serialized and the label is well-formed
