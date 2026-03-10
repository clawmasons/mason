#!/usr/bin/env node

import { CredentialResolver } from "./resolver.js";
import { CredentialService } from "./service.js";
import { CredentialWSClient } from "./ws-client.js";

async function main(): Promise<void> {
  const proxyUrl = process.env.CREDENTIAL_PROXY_URL;
  const proxyToken = process.env.CREDENTIAL_PROXY_TOKEN;
  const dbPath = process.env.CREDENTIAL_DB_PATH;
  const envFilePath = process.env.CREDENTIAL_ENV_FILE;
  const keychainService = process.env.CREDENTIAL_KEYCHAIN_SERVICE ?? "clawmasons";

  if (!proxyUrl) {
    console.error("CREDENTIAL_PROXY_URL is required");
    process.exit(1);
  }

  if (!proxyToken) {
    console.error("CREDENTIAL_PROXY_TOKEN is required");
    process.exit(1);
  }

  const resolver = new CredentialResolver({
    envFilePath,
    keychainService,
  });

  const service = new CredentialService(
    { dbPath, envFilePath, keychainService },
    resolver,
  );

  const client = new CredentialWSClient(service);

  console.log(`[credential-service] Connecting to proxy at ${proxyUrl}...`);

  try {
    await client.connect(proxyUrl, proxyToken);
    console.log("[credential-service] Connected to proxy.");
  } catch (err) {
    console.error("[credential-service] Failed to connect to proxy:", err);
    service.close();
    process.exit(1);
  }

  // Handle shutdown
  const shutdown = (): void => {
    console.log("[credential-service] Shutting down...");
    client.disconnect();
    service.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[credential-service] Fatal error:", err);
  process.exit(1);
});
