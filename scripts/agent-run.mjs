#!/usr/bin/env node
import {spawn, execSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import * as readline from "node:readline";

// Resolve from global node_modules so no local npm install needed
const globalRoot = execSync("npm root -g", {encoding: "utf8"}).trim();
const pkgPath = `${globalRoot}/@khanacademy/format-claude-stream`;
const pkgUrl = pathToFileURL(pkgPath + "/dist/").href;

const {ClaudeStreamFormatter} = await import(pkgUrl + "claude-stream-formatter.js");
const {StandardOutput} = await import(pkgUrl + "adapters/standard-output.js");
const {ChalkColorizer} = await import(pkgUrl + "adapters/chalk-colorizer.js");

const args = process.argv.slice(2);
if (args.length === 0) {
    console.error("Usage: agent-run <prompt>");
    process.exit(1);
}

const prompt = args.join(" ");

// Build claude command args
const claudeArgs = ["--print", "--verbose", "--output-format", "stream-json"];

const showThink = process.env.AGENT_SHOW_THINK === "1";
const think = process.env.AGENT_THINK === "1";

if (showThink || think) {
    claudeArgs.push("--max-thinking-tokens", "31999");
}

claudeArgs.push(prompt);

// Spawn claude
const claude = spawn("claude", claudeArgs, {
    stdio: ["ignore", "pipe", "inherit"],
});

// Format output
const formatter = new ClaudeStreamFormatter(
    new StandardOutput(),
    new ChalkColorizer(),
);

const rl = readline.createInterface({
    input: claude.stdout,
    terminal: false,
});

let chain = Promise.resolve();

rl.on("line", (line) => {
    chain = chain.then(async () => {
        try {
            await formatter.write(JSON.parse(line));
        } catch {
            // skip unparseable lines
        }
    });
});

// Ctrl+C: kill claude, then exit
process.on("SIGINT", () => {
    claude.kill("SIGINT");
    // Give it a moment, then force
    setTimeout(() => {
        claude.kill("SIGTERM");
        process.exit(130);
    }, 500);
});

claude.on("close", (code) => {
    chain.then(() => process.exit(code ?? 0));
});