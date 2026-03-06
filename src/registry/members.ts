import * as fs from "node:fs";
import * as path from "node:path";
import type { MemberEntry, MembersRegistry } from "./types.js";

const REGISTRY_FILENAME = "members.json";

/**
 * Read the members registry from `.chapter/members.json`.
 * Returns an empty registry if the file does not exist.
 */
export function readMembersRegistry(chapterDir: string): MembersRegistry {
  const filePath = path.join(chapterDir, REGISTRY_FILENAME);
  if (!fs.existsSync(filePath)) {
    return { members: {} };
  }
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content) as MembersRegistry;
}

/**
 * Write the members registry to `.chapter/members.json`.
 * Creates the directory if it does not exist.
 */
export function writeMembersRegistry(chapterDir: string, registry: MembersRegistry): void {
  fs.mkdirSync(chapterDir, { recursive: true });
  const filePath = path.join(chapterDir, REGISTRY_FILENAME);
  fs.writeFileSync(filePath, JSON.stringify(registry, null, 2) + "\n");
}

/**
 * Add or update a member entry in the registry.
 * If a member with the same slug already exists, the entry is fully replaced.
 */
export function addMember(chapterDir: string, slug: string, entry: MemberEntry): void {
  const registry = readMembersRegistry(chapterDir);
  registry.members[slug] = entry;
  writeMembersRegistry(chapterDir, registry);
}

/**
 * Update a member's operational status (enabled/disabled).
 * Throws if the member slug is not found in the registry.
 */
export function updateMemberStatus(
  chapterDir: string,
  slug: string,
  status: "enabled" | "disabled",
): void {
  const registry = readMembersRegistry(chapterDir);
  const member = registry.members[slug];
  if (!member) {
    throw new Error(`Member "${slug}" not found in registry`);
  }
  member.status = status;
  writeMembersRegistry(chapterDir, registry);
}

/**
 * Get a member entry by slug.
 * Returns undefined if the member is not in the registry.
 */
export function getMember(chapterDir: string, slug: string): MemberEntry | undefined {
  const registry = readMembersRegistry(chapterDir);
  return registry.members[slug];
}
