## Context

The `chapter docker-init` command expects pre-packed `.tgz` files in `dist/` to populate `docker/node_modules/`. Currently, users must manually run `npm pack` for each workspace package — and `npm pack` without `--pack-destination` drops the tarball in the project root, not `dist/`. This breaks the docker-init pipeline with a confusing error.

The monorepo has 3 workspace packages: `@clawmasons/shared`, `@clawmasons/proxy`, and `@clawmasons/chapter` (cli). All need to be packed for docker-init to discover chapter packages.

## Goals / Non-Goals

**Goals:**
- Single `chapter pack` command that builds and packs all workspace packages into `dist/`
- Clean `dist/*.tgz` before packing to prevent stale artifacts
- Seamless workflow: `chapter pack` → `chapter docker-init`

**Non-Goals:**
- Selective packing of individual packages (pack all or nothing)
- Publishing to npm registry
- Changing the docker-init pipeline itself (it already works once tgz files exist)

## Decisions

### Decision 1: Use `npm pack --workspace` with `--pack-destination`

**Choice**: Run `npm pack` with `--workspace` flags for each package and `--pack-destination dist/`.

**Rationale**: npm natively supports `--pack-destination` and `--workspace` flags. This avoids shelling out to each package directory individually and is the idiomatic npm approach for monorepos.

**Alternative considered**: Running `npm pack` in each package subdirectory then moving files — more fragile and verbose.

### Decision 2: Build before pack

**Choice**: Run `npm run build` (the existing root build script) before packing.

**Rationale**: `npm pack` packages whatever is in the package directory. If TypeScript hasn't been compiled, the tarballs will be missing `dist/` contents. Running build first ensures tarballs contain compiled output.

### Decision 3: Discover workspaces dynamically

**Choice**: Read workspace package names from the root `package.json` workspaces field and glob for `packages/*/package.json` to get the actual package names.

**Rationale**: Avoids hardcoding package names. If a new package is added to the monorepo, `chapter pack` automatically picks it up.

## Risks / Trade-offs

- [Risk] Build failure stops packing → Acceptable; user sees the build error and can fix it
- [Risk] `npm pack` behavior changes across npm versions → Low risk; `--pack-destination` has been stable since npm 7
- [Trade-off] Always builds before packing (slower) → Safety over speed; ensures tarballs are current
