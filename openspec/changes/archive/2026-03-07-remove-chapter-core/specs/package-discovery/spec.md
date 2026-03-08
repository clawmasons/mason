## REMOVED Requirements

### Requirement: Discover chapter sub-packages inside node_modules packages with workspace dirs
**Reason**: The `scanPackageWorkspaceDirs` functionality was designed to discover components bundled inside library packages like `@clawmasons/chapter-core`. With chapter-core removed and components inlined into templates as local workspace packages, this discovery path is no longer needed.
**Migration**: Components are now discovered as regular workspace packages in `apps/`, `tasks/`, `skills/`, `roles/`, `members/` directories. No node_modules sub-package scanning is required.
