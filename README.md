# chapter

Clawmasons Chapter — npm-native packaging, governance, and runtime portability for AI agents.

## Installation

```bash
npm install @clawmasons/chapter
```

Or install globally to use the `chapter` CLI anywhere:

```bash
npm install -g @clawmasons/chapter
```

## CLI Usage

```bash
# Initialize a new chapter workspace
chapter init

# Discover and list all packages in the workspace
chapter list

# Validate an agent's dependency graph
chapter validate @clawmasons/member-note-taker

# Install and generate deployment artifacts
chapter install @clawmasons/member-note-taker

# Run an installed agent
chapter run @clawmasons/member-note-taker

# Stop a running agent
chapter stop @clawmasons/member-note-taker
```

## Using a Local Build

If you're developing chapter itself and want to test your local changes in another project:

### 1. Build from source

```bash
# In the chapter repo
npm install
npm run build
```

### 2. Link locally

```bash
# In the chapter repo — register the local package globally
npm link

# In your consuming project — use the linked version
npm link @clawmasons/chapter
```

Now `chapter` commands and library imports will resolve to your local build. Any changes you make to chapter just need an `npm run build` to take effect.

### 3. Alternative: file dependency

Instead of `npm link`, you can point directly to the local path in your consuming project's `package.json`:

```json
{
  "dependencies": {
    "@clawmasons/chapter": "file:../path/to/chapter"
  }
}
```

Then run `npm install`. This creates a symlink in `node_modules` to your local chapter directory.

### 4. Using the CLI directly without installing

You can also run the CLI directly from the chapter repo without installing or linking:

```bash
node /path/to/chapter/bin/chapter.js <command>
```

## Programmatic API

Chapter exports its core modules for use as a library:

```ts
import {
  discoverPackages,
  resolveAgent,
  validateAgent,
  claudeCodeMaterializer,
} from "@clawmasons/chapter";
```

## Getting Started

Bootstrap a new agent project with a template:

```bash
chapter init --template note-taker
chapter list
chapter validate @my-project/member-note-taker
chapter install @my-project/member-note-taker
```

The `note-taker` template creates a working agent project that uses pre-built components from [`@clawmasons/chapter-core`](./chapter-core/) (apps, tasks, skills, roles) as building blocks.

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
