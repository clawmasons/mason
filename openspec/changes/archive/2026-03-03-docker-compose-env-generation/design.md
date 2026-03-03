## Context

The pam pipeline currently handles: schema validation → package discovery → dependency resolution → graph validation → toolFilter computation → proxy config generation → runtime materialization. The next step is assembling the Docker Compose orchestration layer that ties the proxy and runtime containers together into a deployable stack.

The Docker Compose generator consumes the proxy config, runtime materializer compose services, and agent metadata to produce a complete `docker-compose.yml`. The `.env` generator collects all environment variables required by the proxy (from app `env` fields) and runtimes (API keys). The lock file generator snapshots the resolved graph for reproducibility.

## Goals / Non-Goals

**Goals:**
- Generate a valid `docker-compose.yml` matching PRD §6.2.3 structure with mcp-proxy service, one service per runtime, and agent-net network
- Generate `.env` template with all required environment variables (proxy token, app credentials, runtime API keys) as placeholders
- Generate `pam.lock.json` with resolved agent graph, exact versions, and generated file inventory
- Support configurable proxy port (default 9090) and image (default `ghcr.io/tbxark/mcp-proxy:latest`)
- Include structured JSON logging config on the proxy service

**Non-Goals:**
- `pam install` orchestration (separate change — wires all generators together)
- `pam run` / `pam stop` commands (separate change)
- Strict per-role isolation mode with multiple proxy instances (separate change)
- Secrets manager integration (future)
- Credential prompting UX (part of `pam install` change)

## Decisions

### 1. Module location: `src/compose/`

New top-level module alongside `schemas/`, `resolver/`, `validator/`, `generator/`, `materializer/`. This module handles the final assembly step — composing all pipeline outputs into deployable artifacts.

**Alternative:** Add to `src/generator/`. Rejected because generator handles proxy-level artifacts; compose orchestration is a distinct concern that consumes outputs from both generator and materializer.

### 2. YAML generation via string templates, not a YAML library

Docker Compose YAML has a fixed structure. Using string templates (template literals) avoids a `js-yaml` dependency and gives us precise control over formatting, comments, and field ordering.

**Alternative:** Use `js-yaml` for serialization. Rejected because it adds a dependency for a simple, well-known structure, and library serialization can produce unexpected ordering.

### 3. `.env` uses `VAR=` placeholder format

The `.env` template writes `VAR=` (empty value) for each required variable, with comments grouping them by source (proxy, apps, runtimes). This matches the Docker `.env` convention and makes it clear what needs to be filled in.

### 4. Lock file is JSON with sorted keys

`pam.lock.json` is JSON for easy parsing. Keys are sorted for deterministic diffs. Contains the resolved agent tree with exact versions, plus a `generatedFiles` section listing all produced artifacts.

### 5. Pure functions returning strings/objects

All generators return strings or plain objects — no file I/O. The caller (`pam install`) handles writing files. Consistent with the materializer pattern.

### 6. Proxy environment variables collected from app `env` fields

The mcp-proxy container needs all environment variables referenced by apps' `env` fields (for `${VAR}` interpolation inside the proxy). The compose generator collects these from `ResolvedApp.env` across all roles and adds them to the proxy service's `environment` list.

## Risks / Trade-offs

- **[YAML string templates are fragile]** → Changes to compose structure require careful template updates. Mitigation: comprehensive test coverage comparing generated output against expected YAML.
- **[Environment variable collection may miss variables]** → If an app's env uses `${VAR}` but the variable name differs from the env key. Mitigation: We collect the keys from the `env` field, which is what Docker resolves from `.env`.
- **[Lock file format may evolve]** → No backward-compatibility story yet. Mitigation: Include a `version` field in the lock file for future migration support.
