FROM node:18-bullseye

WORKDIR /app
COPY . .
COPY --from=hirosystems/ordhook /bin/ordhook /bin/ordhook

RUN apt-get update && apt-get install -y git
RUN npm ci && \
    npm run build && \
    npm run generate:git-info && \
    npm prune --production

CMD ["node", "./dist/src/index.js"]
