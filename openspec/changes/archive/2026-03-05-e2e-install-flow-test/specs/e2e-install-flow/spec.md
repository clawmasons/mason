# E2E Install Flow Test Spec

**Status:** Implemented
**Capability:** e2e-install-flow
**PRD refs:** forge-packaging PRD Section 2 (Measurable Outcomes)

## Overview

An automated integration test that validates the complete forge packaging pipeline — from `npm pack` through `forge install` — using only local `.tgz` files with no npm registry access. This test proves that all forge-packaging PRD changes (forge-core package, discovery enhancement, template system, simplified Dockerfile, example removal) compose correctly into a working end-to-end flow.

## Test File

`tests/integration/install-flow.test.ts`

## Preconditions (beforeAll)

1. Run `npm run build` from the forge repo root to compile TypeScript
2. Run `npm pack --json` from the forge repo root to produce `@clawforge/forge` tgz; capture the filename from JSON output
3. Run `npm pack --json` from `forge-core/` to produce `@clawforge/forge-core` tgz; capture the filename from JSON output
4. Create a temp directory with a deterministic prefix: `/tmp/test-forge-<random>/`
5. Store paths to both tgz files and the temp directory for use in tests

## Test Steps

### Step 1: Install tgz packages in temp directory

Run `npm install <path-to-forge.tgz> <path-to-forge-core.tgz>` in the temp directory.

**Assertions:**
- Command exits with code 0
- `node_modules/@clawforge/forge/` exists
- `node_modules/@clawforge/forge-core/` exists
- `node_modules/@clawforge/forge-core/apps/filesystem/package.json` exists

### Step 2: Run forge init with template

Run `forge init --template note-taker` in the temp directory via the locally-installed CLI binary (`node_modules/.bin/forge`). The test avoids `npx` because it can resolve to an unrelated `forge` package on the npm registry.

**Assertions:**
- Command exits with code 0
- `.forge/` directory exists
- `.forge/config.json` exists
- `agents/note-taker/package.json` exists with `@<scope>/agent-note-taker` name
- `roles/writer/package.json` exists with `@<scope>/role-writer` name
- `node_modules/@clawforge/forge-core/` exists (npm install ran)

### Step 3: Run forge validate

Run `forge validate @<scope>/agent-note-taker` in the temp directory.

**Assertions:**
- Command exits with code 0 (agent graph is valid)

### Step 4: Run forge list

Run `forge list --json` in the temp directory.

**Assertions:**
- Command exits with code 0
- JSON output contains agent name `@<scope>/agent-note-taker`
- Agent has a role referencing `@<scope>/role-writer`
- Role references `@clawforge/task-take-notes`, `@clawforge/skill-markdown-conventions`
- Role has app permission for `@clawforge/app-filesystem`

### Step 5: Run forge install

Run `forge install @<scope>/agent-note-taker` in the temp directory.

**Assertions:**
- Command exits with code 0
- Output directory `.forge/agents/note-taker/` exists
- `forge-proxy/Dockerfile` exists within the output
- Dockerfile content does NOT contain `AS builder` (single-stage build)
- Dockerfile contains `FROM node:22-slim`
- `docker-compose.yml` exists within the output

## Postconditions (afterAll)

1. Remove the temp directory recursively (pass or fail)
2. Do NOT remove tgz files (they live in the repo and are gitignored)

## Timeout

120 seconds for the entire test suite (beforeAll + all tests + afterAll).

## Implementation Note

The test invokes the forge CLI via `node_modules/.bin/forge` rather than `npx forge`. This is because `npx forge` resolves to an unrelated npm package named `forge` on the public registry. Using the local binary path ensures the correct `@clawforge/forge` CLI is used.

## Dependencies

- Requires `npm` to be available on PATH
- Requires the forge repo to be buildable (`npm run build` succeeds)
- Does NOT require Docker
- Does NOT require network access to npm registry
