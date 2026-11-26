# syntax=docker/dockerfile:1

# Stage 1: Build aplikasi statis menggunakan Bun + cache mount
FROM oven/bun:1-alpine AS builder
WORKDIR /app

COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

COPY . .
RUN bun run build

# Stage 2: Runtime produksi minimal berbasis Nginx non-root pada port 5758
FROM nginx:alpine AS prod

RUN sed -i '/^user /d; s|/run/nginx.pid|/tmp/nginx.pid|' /etc/nginx/nginx.conf \
 && printf 'server {\n\
  listen 5758;\n\
  server_name _;\n\
  server_tokens off;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
\n\
  add_header X-Content-Type-Options "nosniff" always;\n\
  add_header X-Frame-Options "SAMEORIGIN" always;\n\
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;\n\
\n\
  gzip on;\n\
  gzip_vary on;\n\
  gzip_comp_level 6;\n\
  gzip_min_length 256;\n\
  gzip_types text/plain text/css application/javascript application/json image/svg+xml;\n\
\n\
  location /assets/ {\n\
    expires 1y;\n\
    access_log off;\n\
  }\n\
\n\
  location = /index.html {\n\
    expires -1;\n\
  }\n\
\n\
  location / {\n\
    try_files $uri $uri/ /index.html;\n\
  }\n\
}\n' > /etc/nginx/conf.d/default.conf \
 && chown -R nginx:nginx /var/cache/nginx /var/log/nginx /etc/nginx/conf.d

COPY --from=builder --chown=nginx:nginx /app/dist /usr/share/nginx/html

USER nginx
EXPOSE 5758

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5758/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
