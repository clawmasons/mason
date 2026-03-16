## ADDED Requirements

### Requirement: Interactive prompt to launch VSCode
After printing connection instructions, mason SHALL prompt the user interactively: "Would you like to launch VSCode and attach to the container? (y/N)". The default answer is No. Mason SHALL only proceed to launch VSCode if the user explicitly confirms with `y` or `Y`.

#### Scenario: User confirms VSCode launch
- **WHEN** the user answers `y` or `Y` to the launch prompt
- **THEN** mason proceeds to construct the attached-container URI and spawn `code`

#### Scenario: User declines or presses Enter (default No)
- **WHEN** the user answers `n`, `N`, or presses Enter without input
- **THEN** mason does not attempt to launch VSCode and continues running as credential service host

---

### Requirement: Construct `attached-container` URI using hex-encoded JSON
When the user confirms VSCode launch, mason SHALL construct the VSCode remote URI by:
1. JSON-encoding the object `{ "containerName": "/<container-name>" }`
2. Hex-encoding the JSON string using Node.js `Buffer` (no shell subprocess)
3. Forming the final URI: `vscode-remote://attached-container+<hex-encoded-config><workspace-path>`

The workspace path SHALL be `/workspace/project`.

#### Scenario: URI constructed correctly
- **WHEN** the container name is `forge-engineer` and the workspace is `/workspace/project`
- **THEN** mason constructs the URI `vscode-remote://attached-container+<hex of {"containerName":"/forge-engineer"}>/workspace/project`

#### Scenario: Hex encoding uses Node.js Buffer — no shell dependency
- **WHEN** the URI is constructed
- **THEN** mason uses `Buffer.from(jsonString).toString('hex')` and does not spawn any shell process for encoding

---

### Requirement: Spawn `code` with the `--folder-uri` flag
Mason SHALL execute `code --folder-uri "<uri>"` as a detached child process. If `code` is not found on PATH, mason SHALL print a clear error message explaining that VSCode is not installed or not on PATH, and continue running without crashing.

#### Scenario: `code` found on PATH — VSCode launches
- **WHEN** the user confirms and `code` is available on PATH
- **THEN** mason spawns `code --folder-uri "<uri>"` and VSCode opens attached to the container workspace

#### Scenario: `code` not found on PATH — clear error, no crash
- **WHEN** the user confirms but `code` is not available on PATH
- **THEN** mason prints an error (e.g. "VSCode (`code`) not found on PATH — attach manually using the instructions above") and continues running as credential service host without exiting
