/**
 * Generate a single-stage Dockerfile for the chapter proxy container.
 *
 * The Dockerfile uses the pre-built chapter package (already compiled)
 * from the user's node_modules, creating a slim runtime image with
 * the chapter CLI, agent workspace, and `chapter proxy` as the entrypoint.
 *
 * Production dependencies are installed via `npm install --omit=dev` using
 * the package.json copied into the build context.
 * No TypeScript compilation occurs — only pre-built dist/ is used.
 *
 * Always returns a Dockerfile string — the chapter proxy always needs
 * Node.js regardless of whether apps are stdio or remote.
 */
export function generateProxyDockerfile(
  memberName: string,
): string {
  return `FROM node:22-slim
WORKDIR /app/chapter
COPY chapter/package.json ./
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm install --omit=dev
COPY chapter/dist ./dist
COPY chapter/bin ./bin
WORKDIR /app
COPY workspace/ ./workspace/
RUN mkdir -p /home/node/data /logs && chown -R node:node /app /home/node/data /logs
USER node
WORKDIR /app/workspace
ENTRYPOINT ["node", "/app/chapter/bin/chapter.js"]
CMD ["proxy", "--member", "${memberName}"]
`;
}
