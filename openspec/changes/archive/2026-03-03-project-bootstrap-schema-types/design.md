## Context

forge is a greenfield TypeScript/Node.js project. No source code, configuration, or dependencies exist. The PRD defines five package types (app, skill, task, role, agent), each with a `forge` field in package.json containing type-specific metadata. All downstream functionality — CLI commands, graph resolution, proxy config generation, runtime materializers — depends on being able to parse and validate these `forge` fields.

## Goals / Non-Goals

**Goals:**
- Establish a working TypeScript project with build, test, and lint tooling
- Define Zod schemas that faithfully represent PRD §3 and Appendix A
- Export TypeScript types inferred from Zod schemas (single source of truth)
- Provide a top-level `parseForgeField(input: unknown)` that returns a typed, discriminated result
- Comprehensive unit tests validating PRD example snippets

**Non-Goals:**
- CLI implementation (next change)
- package.json reading/discovery from node_modules (next change)
- Any runtime behavior beyond schema parsing and validation
- Publishing to npm (much later change)

## Decisions

### 1. Zod as schema validation library
**Decision:** Use Zod for schema definitions, deriving TypeScript types via `z.infer<>`.

**Rationale:** Zod provides runtime validation with TypeScript type inference from a single schema definition. Alternatives considered:
- **io-ts**: More functional but worse DX, smaller ecosystem
- **Yup**: Weaker TypeScript inference, designed for forms not data contracts
- **Manual validation**: Error-prone, no type inference

### 2. Discriminated union on `forge.type`
**Decision:** Use Zod's `z.discriminatedUnion("type", [...])` to parse the `forge` field.

**Rationale:** The `type` field ("app" | "skill" | "task" | "role" | "agent") naturally discriminates which fields are valid. This gives precise TypeScript narrowing after validation.

### 3. Project tooling stack
**Decision:** tsconfig (strict mode), vitest (test runner), eslint (flat config with typescript-eslint).

**Rationale:**
- **vitest** over jest: native ESM, faster, same API, better TS support
- **eslint flat config**: eslint v9+ default, simpler than legacy .eslintrc
- **strict TypeScript**: catches more bugs, standard for library code

### 4. Package structure — single package at root
**Decision:** Build `@clawforge/forge` as a single package at the project root, not a monorepo of sub-packages.

**Rationale:** There's only one package to build. Monorepo structure can be introduced if/when forge itself needs workspace packages. The `src/` directory organizes by concern (schemas/, types/).

### 5. Source layout
**Decision:**
```
src/
  schemas/        # Zod schema definitions per package type
    app.ts
    skill.ts
    task.ts
    role.ts
    agent.ts
    forge-field.ts  # Discriminated union + parseForgeField()
    index.ts      # Re-exports
  index.ts        # Public API entry point
```

**Rationale:** Flat-enough structure for a small schema library. Each file maps to one package type, making it easy to find and maintain schemas.

## Risks / Trade-offs

- **[Risk] Schema drift from PRD** → Mitigation: Unit tests validate all PRD example snippets verbatim. Any PRD update should be reflected in tests.
- **[Risk] Overly strict validation rejects valid packages** → Mitigation: Use `.optional()` for fields the PRD marks as optional. Start strict, relax based on real usage.
- **[Trade-off] No monorepo yet** → Acceptable: single package is simpler. Monorepo can be introduced later without breaking changes.
