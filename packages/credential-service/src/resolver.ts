import { loadEnvFile } from "./env-file.js";
import { queryKeychain } from "./keychain.js";

/** Successful credential resolution. */
export interface ResolveSuccess {
  value: string;
  source: "env" | "keychain" | "dotenv";
}

/** Failed credential resolution. */
export interface ResolveError {
  error: string;
  code: "NOT_FOUND";
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
 * Resolves credential values from multiple sources in priority order:
 * 1. Environment variables (process.env)
 * 2. macOS Keychain (darwin only)
 * 3. .env file
 */
export class CredentialResolver {
  private readonly envFilePath: string;
  private readonly keychainService: string;
  private dotenvCache: Record<string, string> | null = null;

  constructor(config: CredentialResolverConfig = {}) {
    this.envFilePath = config.envFilePath ?? ".env";
    this.keychainService = config.keychainService ?? "clawmasons";
  }

  /**
   * Resolve a credential key from available sources.
   *
   * Checks sources in priority order: env → keychain → dotenv.
   * Returns the value and source on success, or an error with
   * the list of sources attempted on failure.
   */
  async resolve(key: string): Promise<ResolveResult> {
    const sourcesAttempted: string[] = [];

    // 1. Environment variables
    sourcesAttempted.push("env");
    const envValue = this.resolveFromEnv(key);
    if (envValue !== undefined) {
      return { value: envValue, source: "env" };
    }

    // 2. macOS Keychain (skipped on non-macOS)
    if (process.platform === "darwin") {
      sourcesAttempted.push("keychain");
      const keychainValue = await this.resolveFromKeychain(key);
      if (keychainValue !== undefined) {
        return { value: keychainValue, source: "keychain" };
      }
    }

    // 3. .env file
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
