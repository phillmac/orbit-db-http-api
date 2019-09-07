FROM node:12

RUN mkdir api

WORKDIR /api

COPY . .

RUN npm ci --only=prod

CMD ["node", "src/cli.js"]