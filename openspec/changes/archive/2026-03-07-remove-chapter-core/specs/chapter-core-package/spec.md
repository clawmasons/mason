## REMOVED Requirements

### Requirement: chapter-core package exists as npm workspace member
**Reason**: The `@clawmasons/chapter-core` package is being eliminated. Its components (apps, tasks, skills) are now inlined directly into the `templates/note-taker/` directory with `{{projectScope}}` placeholders, making initialized projects fully self-contained.
**Migration**: Components are now defined in `templates/note-taker/{apps,tasks,skills}/` with templatized package names. The `chapter-core/` directory and its workspace entry are removed.

### Requirement: chapter-core contains all five component types with @clawmasons scope
**Reason**: chapter-core package is removed entirely.
**Migration**: Apps, tasks, and skills are inlined into the template. Roles and members were already in the template.

### Requirement: All chapter field cross-references use @clawmasons scope
**Reason**: chapter-core package is removed entirely.
**Migration**: Template components use `@{{projectScope}}/` scoped names instead of hardcoded `@clawmasons/` names.

### Requirement: chapter-core produces a valid npm tarball
**Reason**: chapter-core package is removed entirely.
**Migration**: No replacement needed — components are part of the template, not a separate published package.
