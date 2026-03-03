## 1. Project Setup

- [x] 1.1 Create root package.json with name "@clawforge/pam", TypeScript dependencies (typescript, zod, vitest, eslint, typescript-eslint), and build/test scripts
- [x] 1.2 Create tsconfig.json with strict mode, ESM output, and src/tests paths
- [x] 1.3 Create vitest.config.ts
- [x] 1.4 Create eslint.config.js with flat config and typescript-eslint
- [x] 1.5 Run npm install to generate node_modules and package-lock.json

## 2. Schema Implementation

- [x] 2.1 Create src/schemas/app.ts — Zod schema for app pam fields (transport discriminated: stdio requires command+args, sse/streamable-http requires url)
- [x] 2.2 Create src/schemas/skill.ts — Zod schema for skill pam fields (artifacts, description)
- [x] 2.3 Create src/schemas/task.ts — Zod schema for task pam fields (taskType enum, optional prompt/requires/timeout/approval)
- [x] 2.4 Create src/schemas/role.ts — Zod schema for role pam fields (permissions map with allow/deny, optional tasks/skills/constraints)
- [x] 2.5 Create src/schemas/agent.ts — Zod schema for agent pam fields (runtimes, roles, optional resources/proxy)
- [x] 2.6 Create src/schemas/pam-field.ts — Discriminated union on type field + parsePamField() function
- [x] 2.7 Create src/schemas/index.ts — Re-export all schemas and types
- [x] 2.8 Create src/index.ts — Public API entry point re-exporting from schemas

## 3. Unit Tests

- [x] 3.1 Create tests/schemas/app.test.ts — Test valid stdio/sse apps, missing command, env variables per spec scenarios
- [x] 3.2 Create tests/schemas/skill.test.ts — Test valid skill, missing artifacts per spec scenarios
- [x] 3.3 Create tests/schemas/task.test.ts — Test valid subagent/composite tasks, invalid taskType per spec scenarios
- [x] 3.4 Create tests/schemas/role.test.ts — Test valid role with permissions, deny wildcard, constraints per spec scenarios
- [x] 3.5 Create tests/schemas/agent.test.ts — Test valid agent, resources, missing runtimes per spec scenarios
- [x] 3.6 Create tests/schemas/pam-field.test.ts — Test discriminated union parsing, unknown type, missing type per spec scenarios
- [x] 3.7 Validate all PRD example package.json snippets pass schema validation

## 4. Verification

- [x] 4.1 Run npm test and confirm all tests pass
- [x] 4.2 Run npm run build and confirm TypeScript compiles without errors
- [x] 4.3 Run npm run lint and confirm no lint errors
