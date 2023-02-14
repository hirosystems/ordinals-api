FROM node:18-alpine

WORKDIR /app
COPY . .

RUN apk add --no-cache --virtual .build-deps alpine-sdk python3 git openjdk8-jre cmake
RUN npm ci && npm run build && npm prune --production
RUN apk del .build-deps
RUN apk update && apk add bash

CMD ["node", "./dist/src/index.js"]
