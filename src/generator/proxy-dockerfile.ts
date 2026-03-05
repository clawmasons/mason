/**
 * Generate a multi-stage Dockerfile for the forge proxy container.
 *
 * The Dockerfile builds forge from source in a builder stage, then
 * creates a slim runtime image with the forge CLI, agent workspace,
 * and `forge proxy` as the entrypoint.
 *
 * Always returns a Dockerfile string — the forge proxy always needs
 * Node.js regardless of whether apps are stdio or remote.
 */
export function generateProxyDockerfile(
  agentName: string,
): string {
  return `FROM node:22-slim AS builder
WORKDIR /build
COPY forge/ ./forge/
RUN cd forge && npm ci --ignore-scripts && npm run build

FROM node:22-slim
WORKDIR /app
COPY --from=builder /build/forge/dist ./dist
COPY --from=builder /build/forge/bin ./bin
COPY --from=builder /build/forge/node_modules ./node_modules
COPY --from=builder /build/forge/package.json ./
COPY workspace/ ./workspace/
RUN mkdir -p /home/node/data /logs && chown -R node:node /app /home/node/data /logs
USER node
WORKDIR /app/workspace
ENTRYPOINT ["node", "/app/bin/forge.js"]
CMD ["proxy", "--agent", "${agentName}"]
`;
}
