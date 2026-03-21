import { execFile } from "node:child_process";

/**
 * Query macOS Keychain for a credential value by service and account.
 *
 * Uses `security find-generic-password` to look up the value.
 * Returns `undefined` if the key is not found or on any error.
 */
export function queryKeychain(
  service: string,
  account: string,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(
      "security",
      ["find-generic-password", "-s", service, "-a", account, "-w"],
      { timeout: 5000 },
      (error, stdout) => {
        if (error) {
          resolve(undefined);
          return;
        }
        const value = stdout.trim();
        if (value) {
          resolve(value);
        } else {
          resolve(undefined);
        }
      },
    );
  });
}

/**
 * Query macOS Keychain for a credential value by service name only.
 *
 * Uses `security find-generic-password -s <service> -w` without an account.
 * Used for system credentials like Claude Code that store under a service name.
 * Returns `undefined` if not found or on any error.
 */
export function queryKeychainByService(
  service: string,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(
      "security",
      ["find-generic-password", "-s", service, "-w"],
      { timeout: 5000 },
      (error, stdout) => {
        if (error) {
          resolve(undefined);
          return;
        }
        const value = stdout.trim();
        if (value) {
          resolve(value);
        } else {
          resolve(undefined);
        }
      },
    );
  });
}
