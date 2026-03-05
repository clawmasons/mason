/**
 * Generate a single-stage Dockerfile for the forge proxy container.
 *
 * The Dockerfile uses the pre-built forge package (already compiled)
 * from the user's node_modules, creating a slim runtime image with
 * the forge CLI, agent workspace, and `forge proxy` as the entrypoint.
 *
 * Production dependencies are installed via `npm ci --omit=dev` using
 * the package.json and package-lock.json copied into the build context.
 * No TypeScript compilation occurs — only pre-built dist/ is used.
 *
 * Always returns a Dockerfile string — the forge proxy always needs
 * Node.js regardless of whether apps are stdio or remote.
 */
export function generateProxyDockerfile(
  agentName: string,
): string {
  return `FROM node:22-slim
WORKDIR /app/forge
COPY forge/package.json forge/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY forge/dist ./dist
COPY forge/bin ./bin
WORKDIR /app
COPY workspace/ ./workspace/
RUN mkdir -p /home/node/data /logs && chown -R node:node /app /home/node/data /logs
USER node
WORKDIR /app/workspace
ENTRYPOINT ["node", "/app/forge/bin/forge.js"]
CMD ["proxy", "--agent", "${agentName}"]
`;
}
