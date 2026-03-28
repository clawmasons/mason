import { format } from "node:util";

function write(level: string, args: unknown[]): void {
  process.stderr.write(
    `${new Date().toISOString()} [${level}] [agent-sdk] ${format(...args)}\n`,
  );
}

export const sdkLogger = {
  warn(...args: unknown[]) { write("WARN", args); },
  error(...args: unknown[]) { write("ERROR", args); },
};
