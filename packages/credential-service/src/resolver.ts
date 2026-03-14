import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadEnvFile } from "./env-file.js";
import { queryKeychain, queryKeychainByService } from "./keychain.js";

/** Successful credential resolution. */
export interface ResolveSuccess {
  value: string;
  source: "env" | "keychain" | "dotenv" | "session";
}

/** Failed credential resolution. */
export interface ResolveError {
  error: string;
  code: "NOT_FOUND" | "ACCESS_DENIED";
  sourcesAttempted: string[];
}

/** Result of a credential resolution attempt. */
export type ResolveResult = ResolveSuccess | ResolveError;

/** Configuration for the credential resolver. */
export interface CredentialResolverConfig {
  /** Path to the .env file. Defaults to ".env" in cwd. */
  envFilePath?: string;
  /** macOS Keychain service name. Defaults to "clawmasons". */
  keychainService?: string;
}

/**
 * Allowlisted security.* credential keys and their keychain service mappings.
 *
 * Only keys in this map can be resolved via the security.* prefix.
 * Any other security.* key is rejected with ACCESS_DENIED.
 */
const SECURITY_KEY_ALLOWLIST: Record<string, { keychainService: string; fallbackFile: string }> = {
  "security.CLAUDE_CODE_CREDENTIALS": {
    keychainService: "Claude Code-credentials",
    fallbackFile: path.join(os.homedir(), ".claude", ".credentials.json"),
  },
};

/**
 * Resolves credential values from multiple sources in priority order:
 * 0. Session overrides (set via setSessionOverrides, used by ACP proxy)
 * 1. Security key allowlist (for security.* keys — keychain or fallback file)
 * 2. Environment variables (process.env)
 * 3. macOS Keychain (darwin only)
 * 4. .env file
 */
export class CredentialResolver {
  private readonly envFilePath: string;
  private readonly keychainService: string;
  private dotenvCache: Record<string, string> | null = null;
  private sessionOverrides: Record<string, string> = {};

  constructor(config: CredentialResolverConfig = {}) {
    this.envFilePath = config.envFilePath ?? ".env";
    this.keychainService = config.keychainService ?? "clawmasons";
  }

  /**
   * Set session-scoped credential overrides.
   *
   * Session overrides take highest priority during resolution,
   * checked before env, keychain, and dotenv sources. Used by the
   * ACP proxy to inject credentials extracted from ACP client configs.
   */
  setSessionOverrides(overrides: Record<string, string>): void {
    this.sessionOverrides = { ...overrides };
  }

  /**
   * Clear all session-scoped credential overrides.
   */
  clearSessionOverrides(): void {
    this.sessionOverrides = {};
  }

  /**
   * Resolve a credential key from available sources.
   *
   * Checks sources in priority order:
   * session overrides → security.* allowlist → env → keychain → dotenv.
   *
   * Returns the value and source on success, or an error with
   * the list of sources attempted on failure.
   */
  async resolve(key: string): Promise<ResolveResult> {
    // 0. Session overrides (highest priority)
    const sessionValue = this.sessionOverrides[key];
    if (sessionValue !== undefined) {
      return { value: sessionValue, source: "session" };
    }

    // 1. Security key handling (security.* prefix)
    if (key.startsWith("security.")) {
      return this.resolveSecurityKey(key);
    }

    const sourcesAttempted: string[] = [];

    // 2. Environment variables
    sourcesAttempted.push("env");
    const envValue = this.resolveFromEnv(key);
    if (envValue !== undefined) {
      return { value: envValue, source: "env" };
    }

    // 3. macOS Keychain (skipped on non-macOS)
    if (process.platform === "darwin") {
      sourcesAttempted.push("keychain");
      const keychainValue = await this.resolveFromKeychain(key);
      if (keychainValue !== undefined) {
        return { value: keychainValue, source: "keychain" };
      }
    }

    // 4. .env file
    sourcesAttempted.push("dotenv");
    const dotenvValue = this.resolveFromDotenv(key);
    if (dotenvValue !== undefined) {
      return { value: dotenvValue, source: "dotenv" };
    }

    return {
      error: `Credential "${key}" not found in any source`,
      code: "NOT_FOUND",
      sourcesAttempted,
    };
  }

  /**
   * Resolve a security.* prefixed credential key.
   *
   * Only keys in SECURITY_KEY_ALLOWLIST are permitted.
   * On macOS: queries the keychain using the mapped service name.
   * On other platforms: reads the fallback file contents.
   */
  private async resolveSecurityKey(key: string): Promise<ResolveResult> {
    const mapping = SECURITY_KEY_ALLOWLIST[key];
    if (!mapping) {
      return {
        error: `Security key "${key}" is not in the allowlist`,
        code: "ACCESS_DENIED",
        sourcesAttempted: ["security-allowlist"],
      };
    }

    const sourcesAttempted: string[] = [];

    if (process.platform === "darwin") {
      // macOS: query keychain by service name
      sourcesAttempted.push("keychain");
      const value = await queryKeychainByService(mapping.keychainService);
      if (value !== undefined) {
        return { value, source: "keychain" };
      }
    }

    // Fallback: read from file
    sourcesAttempted.push("file");
    try {
      const value = fs.readFileSync(mapping.fallbackFile, "utf-8");
      if (value.trim()) {
        return { value: value.trim(), source: "dotenv" };
      }
    } catch {
      // File not found or unreadable
    }

    return {
      error: `Credential "${key}" not found in any source`,
      code: "NOT_FOUND",
      sourcesAttempted,
    };
  }

  /** Check process environment variables. */
  private resolveFromEnv(key: string): string | undefined {
    const value = process.env[key];
    if (value !== undefined && value !== "") {
      return value;
    }
    return undefined;
  }

  /** Query macOS Keychain via `security find-generic-password`. */
  private resolveFromKeychain(key: string): Promise<string | undefined> {
    return queryKeychain(this.keychainService, key);
  }

  /** Look up the key in the parsed .env file. */
  private resolveFromDotenv(key: string): string | undefined {
    if (this.dotenvCache === null) {
      this.dotenvCache = loadEnvFile(this.envFilePath);
    }
    const value = this.dotenvCache[key];
    if (value !== undefined) {
      return value;
    }
    return undefined;
  }
}
