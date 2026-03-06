/**
 * A single member entry in the members registry.
 */
export interface MemberEntry {
  /** npm package name, e.g. "@acme/member-note-taker" */
  package: string;
  /** Whether this member is a human or AI agent */
  memberType: "human" | "agent";
  /** Operational status */
  status: "enabled" | "disabled";
  /** ISO 8601 timestamp of when the member was installed or last reinstalled */
  installedAt: string;
}

/**
 * The members registry stored at `.chapter/members.json`.
 * Keys are member slugs.
 */
export interface MembersRegistry {
  members: Record<string, MemberEntry>;
}
