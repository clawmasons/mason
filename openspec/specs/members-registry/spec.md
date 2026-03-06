# Spec: members-registry

## Purpose

Manages the `.chapter/members.json` registry file that tracks installed members, their types, and their operational status (enabled/disabled).

## Requirements

### Requirement: Registry file format

The members registry SHALL be stored as a JSON file at `.chapter/members.json`. The file SHALL contain a `members` object keyed by member slug, where each entry contains `package` (string), `memberType` ("human" | "agent"), `status` ("enabled" | "disabled"), and `installedAt` (ISO 8601 timestamp string).

#### Scenario: Registry file structure
- **GIVEN** a workspace with installed members
- **THEN** `.chapter/members.json` SHALL have the structure:
  ```json
  {
    "members": {
      "<slug>": {
        "package": "<npm-package-name>",
        "memberType": "human" | "agent",
        "status": "enabled" | "disabled",
        "installedAt": "<ISO-8601-timestamp>"
      }
    }
  }
  ```

### Requirement: readMembersRegistry returns empty registry when file does not exist

The `readMembersRegistry(chapterDir)` function SHALL return `{ members: {} }` if the `.chapter/members.json` file does not exist or the `.chapter/` directory does not exist.

#### Scenario: No registry file
- **WHEN** `readMembersRegistry()` is called and `.chapter/members.json` does not exist
- **THEN** it SHALL return `{ members: {} }`

#### Scenario: Valid registry file
- **WHEN** `readMembersRegistry()` is called and `.chapter/members.json` exists with valid JSON
- **THEN** it SHALL return the parsed registry object

### Requirement: writeMembersRegistry creates file and directory

The `writeMembersRegistry(chapterDir, registry)` function SHALL write the registry as pretty-printed JSON (2-space indent) with a trailing newline. It SHALL create the `.chapter/` directory if it does not exist.

#### Scenario: Write to new directory
- **WHEN** `writeMembersRegistry()` is called and the directory does not exist
- **THEN** the directory SHALL be created and the file SHALL be written

#### Scenario: Overwrite existing file
- **WHEN** `writeMembersRegistry()` is called and the file already exists
- **THEN** the file SHALL be fully overwritten with the new content

### Requirement: addMember adds or updates a member entry

The `addMember(chapterDir, slug, entry)` function SHALL read the current registry, set `members[slug]` to the provided entry (overwriting if the slug already exists), and write the updated registry.

#### Scenario: Add new member
- **WHEN** `addMember()` is called with a slug not in the registry
- **THEN** a new entry SHALL be added

#### Scenario: Update existing member
- **WHEN** `addMember()` is called with a slug already in the registry
- **THEN** the entry SHALL be fully replaced (not merged)

### Requirement: updateMemberStatus changes member status

The `updateMemberStatus(chapterDir, slug, status)` function SHALL update the `status` field of the member with the given slug. It SHALL throw an error if the slug is not found in the registry.

#### Scenario: Change status to disabled
- **WHEN** `updateMemberStatus()` is called with status `"disabled"` for an existing member
- **THEN** the member's status SHALL be `"disabled"` and all other fields SHALL be preserved

#### Scenario: Member not found
- **WHEN** `updateMemberStatus()` is called with a slug not in the registry
- **THEN** an error SHALL be thrown with message `Member "<slug>" not found in registry`

### Requirement: getMember retrieves a member entry

The `getMember(chapterDir, slug)` function SHALL return the member entry for the given slug, or `undefined` if the slug is not in the registry.

#### Scenario: Existing member
- **WHEN** `getMember()` is called with a slug that exists in the registry
- **THEN** the member entry SHALL be returned

#### Scenario: Non-existent member
- **WHEN** `getMember()` is called with a slug not in the registry
- **THEN** `undefined` SHALL be returned
