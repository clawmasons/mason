## RENAMED Requirements

### Requirement: App schema validation
FROM: `AppChapterField`, `appChapterFieldSchema`
TO: `AppField`, `appFieldSchema`

### Requirement: Skill schema validation
FROM: `SkillChapterField`, `skillChapterFieldSchema`
TO: `SkillField`, `skillFieldSchema`

### Requirement: Task schema validation
FROM: `TaskChapterField`, `taskChapterFieldSchema`
TO: `TaskField`, `taskFieldSchema`

### Requirement: Role schema validation
FROM: `RoleChapterField`, `roleChapterFieldSchema`
TO: `RoleField`, `roleFieldSchema`

### Requirement: Member schema validation
FROM: `MemberChapterField`
TO: `MemberField`

## MODIFIED Requirements

### Requirement: Discriminated union parsing
The system SHALL provide a `parseField(input: unknown)` function that dispatches on the `type` field to parse any valid metadata field and return a precisely typed result. Invalid inputs SHALL produce actionable error messages. The union type SHALL be named `Field` (not `ChapterField`).

#### Scenario: Parse by type discrimination
- **WHEN** `parseField({ type: "app", transport: "stdio", command: "npx", args: [], tools: ["t"], capabilities: ["tools"] })` is called
- **THEN** the result is a success with data narrowed to `AppField`

#### Scenario: Parse with unknown type
- **WHEN** `parseField({ type: "unknown" })` is called
- **THEN** the result is a failure with an error indicating "unknown" is not a valid discriminator value

#### Scenario: Parse with missing type
- **WHEN** `parseField({})` is called
- **THEN** the result is a failure with an error indicating `type` is required

## RENAMED Requirements

### Requirement: File rename
FROM: `chapter-field.ts`, `chapter-field.test.ts`
TO: `field.ts`, `field.test.ts`
