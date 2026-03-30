## Tasks

- [ ] Add fixture files: `deploy/staging.md`, `deploy/production.md` under `.claude/commands/`
- [ ] Add fixture: `.mason/roles/base-role/ROLE.md` with explicit tasks for includes test
- [ ] Test 1: Auto-creation — verify ROLE.md created with correct template
- [ ] Test 2: Reuse — verify existing ROLE.md not overwritten
- [ ] Test 3: Wildcard all — verify auto-created ROLE.md has `tasks: ["*"]`
- [ ] Test 4: Scoped wildcard — verify `tasks: ["deploy/*"]` accepted without error
- [ ] Test 5: Explicit restriction — verify `tasks: ["review"]` accepted
- [ ] Test 6: Alias — verify `commands: ["*"]` works in mason dialect
- [ ] Test 7: Role includes — verify `role.includes` accepted without error
- [ ] Test 8: Circular include — verify error message with cycle chain
- [ ] Test 9: Write failure fallback — verify fallback warning on read-only dir
- [ ] Run lint, build, and E2E tests to verify all pass
