# MCP Server Matcher

The MCP server matcher is a pure function that compares ACP client `mcpServers` entries against chapter's resolved Apps to determine which servers are governed and which should be dropped.

## Requirements

### Requirement: matchServers returns matched servers linked to their chapter App

The `matchServers()` function SHALL accept a record of mcpServers configs and an array of ResolvedApp objects, and return a MatchResult with matched and unmatched arrays.

#### Scenario: Name-based match
- **GIVEN** apps containing `@clawmasons/app-github` (short name `"github"`)
- **WHEN** `matchServers({"github": {command: "npx", args: ["-y", "@modelcontextprotocol/server-github"]}}, apps)` is called
- **THEN** the result has one matched entry with `name: "github"` and `app.name: "@clawmasons/app-github"`
- **AND** the result has zero unmatched entries

#### Scenario: Multiple servers, partial match
- **GIVEN** apps containing `@clawmasons/app-github` and `@clawmasons/app-slack`
- **WHEN** `matchServers({"github": {...}, "slack": {...}, "personal-notes": {...}}, apps)` is called
- **THEN** the result has two matched entries (`github`, `slack`)
- **AND** the result has one unmatched entry (`personal-notes`)

### Requirement: Matching is case-insensitive

The matcher SHALL compare mcpServers keys against app short names in a case-insensitive manner.

#### Scenario: Mixed case key matches lowercase short name
- **GIVEN** apps containing `@clawmasons/app-github` (short name `"github"`)
- **WHEN** `matchServers({"GitHub": {...}}, apps)` is called
- **THEN** `"GitHub"` is matched to `@clawmasons/app-github`

#### Scenario: Uppercase key matches
- **GIVEN** apps containing `@clawmasons/app-slack` (short name `"slack"`)
- **WHEN** `matchServers({"SLACK": {...}}, apps)` is called
- **THEN** `"SLACK"` is matched to `@clawmasons/app-slack`

### Requirement: Unmatched servers include descriptive reasons

Each unmatched server SHALL include a human-readable `reason` string explaining why no match was found.

#### Scenario: No matching app
- **GIVEN** apps containing `@clawmasons/app-github`
- **WHEN** `matchServers({"personal-notes": {...}}, apps)` is called
- **THEN** the unmatched entry has `reason` containing "no matching chapter App"

### Requirement: Empty inputs produce empty results

The matcher SHALL handle empty inputs gracefully.

#### Scenario: Empty mcpServers
- **GIVEN** apps containing `@clawmasons/app-github`
- **WHEN** `matchServers({}, apps)` is called
- **THEN** the result has zero matched and zero unmatched entries

#### Scenario: Empty apps
- **GIVEN** an empty apps array
- **WHEN** `matchServers({"github": {...}}, [])` is called
- **THEN** all servers are unmatched

### Requirement: Duplicate short names are disambiguated by command/URL

When multiple apps produce the same short name, the matcher SHALL use command+args (for stdio) or URL (for remote) as tiebreakers.

#### Scenario: Two apps with same short name, disambiguated by command
- **GIVEN** two apps both with short name `"github"`: one with `command: "npx"`, `args: ["-y", "@modelcontextprotocol/server-github"]` and another with `command: "docker"`, `args: ["run", "github-server"]`
- **WHEN** `matchServers({"github": {command: "npx", args: ["-y", "@modelcontextprotocol/server-github"]}}, apps)` is called
- **THEN** the matched entry is linked to the app with matching command+args

#### Scenario: Two apps with same short name, disambiguated by URL
- **GIVEN** two apps both with short name `"api"`: one with `url: "https://api1.example.com"` and another with `url: "https://api2.example.com"`
- **WHEN** `matchServers({"api": {url: "https://api1.example.com"}}, apps)` is called
- **THEN** the matched entry is linked to the app with matching URL

### Requirement: MatchedServer preserves original config and app reference

Each matched server SHALL include the original mcpServers key name, the original config, the matched ResolvedApp, and the app's short name.

#### Scenario: Matched server structure
- **GIVEN** apps containing `@clawmasons/app-github`
- **WHEN** a server named `"github"` with `env: {GITHUB_TOKEN: "ghp_123"}` matches
- **THEN** the MatchedServer has `name: "github"`, `config.env.GITHUB_TOKEN: "ghp_123"`, `app.name: "@clawmasons/app-github"`, `appShortName: "github"`
