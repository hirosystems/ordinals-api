FROM hirosystems/ordhook:latest

WORKDIR /app
COPY . .

RUN apt-get update && apt-get install -y ca-certificates curl gnupg git
RUN curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /tmp/nodesource.gpg
ENV NODE_MAJOR 18
RUN echo "deb [signed-by=/tmp/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
RUN apt-get update && apt-get install nodejs -y

RUN npm ci && \
    npm run build && \
    npm run generate:git-info && \
    npm prune --production

CMD ["node", "./dist/src/index.js"]
