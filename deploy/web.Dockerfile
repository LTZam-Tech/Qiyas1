# Qiyas web: the React build behind Nginx, which also proxies /api to the API service.
# Fonts are bundled by the build; the image makes no internet calls at run time.
# TODO(CI-15): pin node:20-alpine by digest (node:20-alpine@sha256:...).
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
ENV VITE_API_BASE_URL=/api/v1
RUN npm run build

# TODO(CI-15): pin nginx:1.27-alpine by digest (nginx:1.27-alpine@sha256:...).
FROM nginx:1.29-alpine
# Pull the latest Alpine security fixes for OS packages; CI-7 trivy gate
RUN apk upgrade --no-cache && apk add --no-cache openssl
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/tls-entrypoint.sh /docker-entrypoint.d/05-qiyas-tls.sh
RUN chmod +x /docker-entrypoint.d/05-qiyas-tls.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80 443
