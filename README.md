# forge

Agent Forge System — npm-native packaging, governance, and runtime portability for AI agents.

## Installation

```bash
npm install @clawforge/forge
```

Or install globally to use the `forge` CLI anywhere:

```bash
npm install -g @clawforge/forge
```

## CLI Usage

```bash
# Initialize a new forge workspace
forge init

# Discover and list all packages in the workspace
forge list

# Validate an agent's dependency graph
forge validate @example/agent-note-taker

# Install and generate deployment artifacts
forge install @example/agent-note-taker

# Run an installed agent
forge run @example/agent-note-taker

# Stop a running agent
forge stop @example/agent-note-taker
```

## Using a Local Build

If you're developing forge itself and want to test your local changes in another project:

### 1. Build from source

```bash
# In the forge repo
npm install
npm run build
```

### 2. Link locally

```bash
# In the forge repo — register the local package globally
npm link

# In your consuming project — use the linked version
npm link @clawforge/forge
```

Now `forge` commands and library imports will resolve to your local build. Any changes you make to forge just need an `npm run build` to take effect.

### 3. Alternative: file dependency

Instead of `npm link`, you can point directly to the local path in your consuming project's `package.json`:

```json
{
  "dependencies": {
    "@clawforge/forge": "file:../path/to/forge"
  }
}
```

Then run `npm install`. This creates a symlink in `node_modules` to your local forge directory.

### 4. Using the CLI directly without installing

You can also run the CLI directly from the forge repo without installing or linking:

```bash
node /path/to/forge/bin/forge.js <command>
```

## Programmatic API

Forge exports its core modules for use as a library:

```ts
import {
  discoverPackages,
  resolveAgent,
  validateAgent,
  claudeCodeMaterializer,
} from "@clawforge/forge";
```

## Example

See the [`example/`](./example/) directory for a complete workspace demonstrating all 5 component types (app, skill, task, role, agent) with a self-contained note-taking agent.

## Development

```bash
npm install          # install dependencies
npm run build        # compile TypeScript
npm run typecheck    # type-check without emitting
npm run lint         # run ESLint
npm test             # run tests
```

## License

MIT
