# syntax=docker/dockerfile:1
# Image cổng ngoài: Caddy + giao diện web (FE) đã build sẵn. Caddy phục vụ FE cùng nguồn với /api (không cần CORS).
# Ngữ cảnh build là GỐC repo:  docker build -f BE/infra/docker/web.Dockerfile .
# Loại tệp riêng cho Dockerfile này nằm ở web.Dockerfile.dockerignore (khác với .dockerignore của image BE vốn bỏ FE).

FROM node:22-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@10.27.0 --activate
WORKDIR /app

# Chỉ chép package.json trước để lớp cài dependency được cache khi mã nguồn đổi.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY FE/package.json FE/package.json
COPY BE/packages/shared-library/package.json BE/packages/shared-library/package.json
COPY BE/services/user/package.json BE/services/user/package.json
COPY BE/services/catalog/package.json BE/services/catalog/package.json
COPY BE/services/ordering/package.json BE/services/ordering/package.json
COPY BE/services/customer/package.json BE/services/customer/package.json
COPY BE/services/affiliate/package.json BE/services/affiliate/package.json
COPY BE/services/tracking/package.json BE/services/tracking/package.json
COPY BE/services/gateway/package.json BE/services/gateway/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "figma-make-app..."

COPY FE FE
RUN pnpm --filter figma-make-app build

# ───────── runtime: Caddy + tệp tĩnh ─────────
FROM caddy:2-alpine
COPY --from=build /app/FE/dist /srv/www
