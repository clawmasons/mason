# Tasks: Members Registry — `.chapter/members.json`

## Implementation Tasks

### Task 1: Create registry types
- [ ] Create `src/registry/types.ts` with `MemberEntry` and `MembersRegistry` interfaces

### Task 2: Implement registry module
- [ ] Create `src/registry/members.ts` with `readMembersRegistry()`, `writeMembersRegistry()`, `addMember()`, `updateMemberStatus()`, `getMember()`
- [ ] Handle missing file case (return empty registry)
- [ ] Handle directory creation in `writeMembersRegistry()`

### Task 3: Write registry unit tests
- [ ] Create `tests/registry/members.test.ts`
- [ ] Test `readMembersRegistry()` with missing file
- [ ] Test `readMembersRegistry()` with valid file
- [ ] Test `writeMembersRegistry()` creates file
- [ ] Test `writeMembersRegistry()` creates directory
- [ ] Test `addMember()` adds new entry
- [ ] Test `addMember()` overwrites existing entry
- [ ] Test `updateMemberStatus()` changes status
- [ ] Test `updateMemberStatus()` throws for missing slug
- [ ] Test `getMember()` returns entry
- [ ] Test `getMember()` returns undefined for missing

### Task 4: Integrate registry with install command
- [ ] Import `addMember` in `src/cli/commands/install.ts`
- [ ] Call `addMember()` after successful human member install
- [ ] Call `addMember()` after successful agent member install
- [ ] Add install test: verify `members.json` is created with correct entry
- [ ] Add install test: verify reinstall updates (not duplicates) entry
- [ ] Add install test: verify human member install updates registry

### Task 5: Integrate registry with list command
- [ ] Import `readMembersRegistry` in `src/cli/commands/list.ts`
- [ ] Read registry and display member type and status alongside member name
- [ ] Handle case where member is not in registry (show type without status)
- [ ] Add list test: verify status display with registry
- [ ] Add list test: verify display without registry

### Task 6: Create/update specs
- [ ] Create `openspec/specs/members-registry/spec.md`
- [ ] Update `openspec/specs/forge-install-command/spec.md` with registry integration requirement
- [ ] Update `openspec/specs/list-command/spec.md` with status display and member terminology
