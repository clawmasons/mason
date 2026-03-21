## 1. Approval Dialog — osascript Native Dialog

- [x] 1.1 Create `packages/proxy/src/approvals/dialog.ts` with `showApprovalDialog()` and `escapeForOsascript()`
- [x] 1.2 Create `packages/proxy/tests/approvals/dialog.test.ts` with approve/deny/close/non-macOS/escaping tests

## 2. Approval Handler — Host-side Relay Handler

- [x] 2.1 Create `packages/proxy/src/approvals/handler.ts` with `ApprovalHandler` class
- [x] 2.2 Create `packages/proxy/tests/approvals/handler.test.ts` with registration, message flow, TTL timeout tests

## 3. Exports — Update Index

- [x] 3.1 Modify `packages/proxy/src/index.ts` — add `ApprovalHandler` and `showApprovalDialog` exports

## 4. Verification

- [x] 4.1 Run `npx tsc --noEmit` — compiles without errors (pre-existing CLI test type error unrelated)
- [x] 4.2 Run `npx vitest run packages/proxy/tests/` — all 341 tests pass (20 files)
