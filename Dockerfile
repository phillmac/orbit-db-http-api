FROM node:12.14.0

RUN mkdir api

WORKDIR /api

COPY . .

RUN npm ci --only=prod

# RUN git remote set-url origin https://github.com/phillmac/orbit-db-http-api-dev.git \
# && git branch --set-upstream-to=origin/debug debug
