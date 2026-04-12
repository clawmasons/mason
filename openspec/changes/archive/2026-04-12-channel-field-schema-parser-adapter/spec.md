# Spec: channel Field in Role Schema + Parser + Adapter

**Change:** CHANGE 1 from PRD `role-channels`
**Date:** 2026-04-12
**PRD refs:** REQ-001, REQ-002

## Overview

Add the `channel` field to the role pipeline: Zod schema, frontmatter parser, adapter, and resolved types. The field is optional and generic -- any channel type string is accepted. The parser normalizes the short form (`channel: slack`) to the object form (`{ type: "slack", args: [] }`).

## Schema

Two new schemas in `packages/shared/src/schemas/role-types.ts`:

- `channelConfigSchema`: `z.object({ type: z.string(), args: z.array(z.string()).optional().default([]) })`
- `channelFieldSchema`: `z.union([z.string(), channelConfigSchema])`

`roleSchema` gains: `channel: z.preprocess((val) => typeof val === "string" ? { type: val, args: [] } : val, channelConfigSchema).optional()` -- the preprocess ensures the `Role` type always has the normalized object form, even when YAML contains the string shorthand.

## Type

`ChannelConfig` exported from `packages/shared/src/types/role.ts` as `z.infer<typeof channelConfigSchema>`.

`ResolvedRole` in `packages/shared/src/types.ts` gains: `channel?: { type: string; args: string[] }`

`MaterializeOptions` in `packages/agent-sdk/src/types.ts` gains: `channelConfig?: { type: string; args: string[] }`

## Parser

In `readMaterializedRole()`, the parser extracts `frontmatter.channel`. If it is a string, it normalizes to `{ type: <string>, args: [] }`. The normalized value is included in `roleData` passed to `roleSchema.parse()`.

## Adapter

In `buildResolvedRole()`, if `role.channel` is defined, it is copied to `resolvedRole.channel` with args spread to a new array.

## Merge

Channel uses scalar current-wins semantics. The existing `...current` spread in `mergeRoles()` handles this -- no code change needed beyond verifying the behavior with a test.

## Barrel Exports

- `packages/shared/src/schemas/index.ts`: export `channelConfigSchema`, `channelFieldSchema`
- `packages/shared/src/index.ts`: export `channelConfigSchema`, `channelFieldSchema`, type `ChannelConfig`
