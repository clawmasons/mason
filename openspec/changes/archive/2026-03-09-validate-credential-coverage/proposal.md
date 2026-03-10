## Why

The credential service infrastructure (Changes 1-9) builds the pipeline for credential resolution and delivery, but there is no pre-flight check that catches misconfigured agents. An agent might use an app requiring `SERP_API_KEY` without declaring that credential, leading to runtime failures that are hard to diagnose. The `chapter validate` command already checks tool existence and requirement coverage -- extending it to check credential coverage follows the same pattern and catches misconfiguration at authoring time.

## What Changes

- Modify: `packages/cli/src/validator/validate.ts` -- add `checkCredentialCoverage()` that validates agent credentials are a superset of all app credentials across its roles
- Modify: `packages/cli/src/validator/types.ts` -- add `"credential-coverage"` to warning categories
- Modify: `packages/cli/tests/validator/validate.test.ts` -- add credential coverage test cases
- Modify: `packages/cli/tests/cli/validate.test.ts` -- add integration test for credential warnings in CLI output

### New Capabilities
- Credential coverage validation: for each agent, check that `agent.credentials` is a superset of the union of all `app.credentials` across roles
- Emit warnings (not errors) for missing credentials, naming the agent, missing key, and declaring app

### Modified Capabilities
- `validateAgent()` now includes credential coverage checks
- `ValidationWarningCategory` type gains `"credential-coverage"`

## Impact

- Modify: `packages/cli/src/validator/validate.ts`
- Modify: `packages/cli/src/validator/types.ts`
- Modify: `packages/cli/tests/validator/validate.test.ts`
- Modify: `packages/cli/tests/cli/validate.test.ts`
