FROM node:12
#tiny-secp256k1 barfs on any higher version

RUN mkdir api

WORKDIR /api

COPY . .

RUN npm ci --only=prod

RUN git remote set-url origin https://github.com/phillmac/orbit-db-http-api-dev.git \
&& git branch --set-upstream-to=origin/debug debug
