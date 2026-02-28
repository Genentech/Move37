FROM node:20-alpine AS builder

ARG WEB_SDK_SOURCE=local
ARG WEB_SDK_VERSION=0.1.0
ARG GITHUB_NPM_OWNER=genentech
ARG GITHUB_NPM_TOKEN=

WORKDIR /app

COPY src/penroselamarck/web/package.json src/penroselamarck/web/package-lock.json ./
COPY src/penroselamarck/sdk/ts /sdk/ts

RUN set -eux; \
    if [ "$WEB_SDK_SOURCE" = "registry" ]; then \
      echo "@${GITHUB_NPM_OWNER}:registry=https://npm.pkg.github.com" > .npmrc; \
      if [ -n "$GITHUB_NPM_TOKEN" ]; then \
        echo "//npm.pkg.github.com/:_authToken=${GITHUB_NPM_TOKEN}" >> .npmrc; \
      fi; \
      npm pkg set "dependencies.@genentech/penroselamarck=${WEB_SDK_VERSION}"; \
    else \
      cd /sdk/ts; \
      npm install; \
      npm run build; \
      cd /app; \
      npm pkg set "dependencies.@genentech/penroselamarck=file:/sdk/ts"; \
    fi; \
    npm install; \
    rm -f .npmrc

COPY src/penroselamarck/web ./
RUN npm run build

FROM nginx:1.27-alpine
ARG VERSION=dev
ARG VCS_REF=unknown

LABEL org.opencontainers.image.title="penroselamarck-web"
LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.revision="${VCS_REF}"

COPY --from=builder /app/dist /usr/share/nginx/html
COPY src/penroselamarck/web/nginx.proxy.conf /etc/nginx/penroselamarck/nginx.proxy.conf
COPY src/penroselamarck/web/nginx.standalone.conf /etc/nginx/penroselamarck/nginx.standalone.conf
COPY src/penroselamarck/web/docker-entrypoint/40-web-mode.sh /docker-entrypoint.d/40-web-mode.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
