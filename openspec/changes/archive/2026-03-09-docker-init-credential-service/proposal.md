## Why

The `docker-init` command currently generates Dockerfiles for proxy and agent containers but not for the credential service. The credential service needs its own Dockerfile so it can run as a separate container in the Docker Compose setup, receiving forwarded credential requests from the proxy via WebSocket.

## What Changes

- Add a new generator `credential-service-dockerfile.ts` following the proxy/agent Dockerfile generator pattern
- Modify `docker-init.ts` to call the new generator and write the Dockerfile to `docker/credential-service/Dockerfile`
- Add unit tests for the generator
- Update the generator barrel export

### New Capabilities
- `credential-service-dockerfile`: Generate a Dockerfile for the credential service container

### Modified Capabilities
- `docker-init`: Extended to generate credential service Dockerfile alongside proxy and agent Dockerfiles

## Impact

- New: `packages/cli/src/generator/credential-service-dockerfile.ts`
- Modified: `packages/cli/src/generator/index.ts` (add export)
- Modified: `packages/cli/src/cli/commands/docker-init.ts` (call generator, write file)
- New: `packages/cli/tests/generator/credential-service-dockerfile.test.ts`
