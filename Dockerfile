FROM node:18-bullseye

COPY --from=hirosystems/ordhook /bin/ordhook /bin/ordhook

WORKDIR /app
COPY . .

RUN apt-get update && apt-get install -y git
RUN npm ci && \
    npm run build && \
    npm run generate:git-info && \
    npm prune --production

CMD ["node", "./dist/src/index.js"]
