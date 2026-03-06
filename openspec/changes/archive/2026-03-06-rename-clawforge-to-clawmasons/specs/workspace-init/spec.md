## MODIFIED Requirements

### Requirement: Template directory structure

The `@clawmasons/forge` package SHALL contain a `templates/` directory with bundled starter templates.

#### Scenario: Template root package.json

- **WHEN** a template is scaffolded
- **THEN** the root package.json SHALL depend on `@clawmasons/forge-core`

#### Scenario: Template role references

- **WHEN** a template includes a role with tasks, skills, and apps
- **THEN** the role SHALL reference packages under the `@clawmasons` scope (e.g., `@clawmasons/task-take-notes`, `@clawmasons/skill-markdown-conventions`, `@clawmasons/app-filesystem`)
