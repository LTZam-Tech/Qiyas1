# Qiyas web: the React build behind Nginx, which also proxies /api to the API service.
# Fonts are bundled by the build; the image makes no internet calls at run time.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
ENV VITE_API_BASE_URL=/api/v1
RUN npm run build

FROM nginx:1.27-alpine
RUN apk add --no-cache openssl
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/tls-entrypoint.sh /docker-entrypoint.d/05-qiyas-tls.sh
RUN chmod +x /docker-entrypoint.d/05-qiyas-tls.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80 443
