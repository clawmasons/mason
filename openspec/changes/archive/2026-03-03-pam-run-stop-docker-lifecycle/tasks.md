## 1. Shared Utilities

- [x] 1.1 Create `src/cli/commands/docker-utils.ts` with shared helpers: `resolveAgentDir(rootDir, agentName, outputDir?)`, `checkDockerCompose()`, and `validateEnvFile(agentDir)`
- [x] 1.2 Write unit tests for `resolveAgentDir` (default path, custom path, missing directory)
- [x] 1.3 Write unit tests for `validateEnvFile` (all filled, empty values, missing file)

## 2. Run Command

- [x] 2.1 Create `src/cli/commands/run.ts` with `registerRunCommand` and `runAgent` functions
- [x] 2.2 Implement agent directory resolution using `resolveAgentDir`
- [x] 2.3 Implement env validation gate using `validateEnvFile`
- [x] 2.4 Implement Docker Compose delegation with `spawn` and `stdio: 'inherit'`
- [x] 2.5 Implement `--runtime` flag to selectively start `mcp-proxy` + specified runtime
- [x] 2.6 Validate that specified runtime exists in docker-compose.yml before starting
- [x] 2.7 Write unit tests for run command (success, missing dir, missing env, runtime filtering)

## 3. Stop Command

- [x] 3.1 Create `src/cli/commands/stop.ts` with `registerStopCommand` and `stopAgent` functions
- [x] 3.2 Implement agent directory resolution and Docker Compose down delegation
- [x] 3.3 Write unit tests for stop command (success, missing dir, compose failure)

## 4. Command Registration

- [x] 4.1 Register `run` and `stop` commands in `src/cli/commands/index.ts`
- [x] 4.2 Verify CLI help output shows run and stop commands
