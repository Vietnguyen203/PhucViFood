# syntax=docker/dockerfile:1
# Một Dockerfile cho cả 7 service; chọn service bằng build arg SERVICE (user, catalog, ordering, customer, affiliate, tracking, gateway).
# Ngữ cảnh build là GỐC repo:  docker build -f BE/infra/docker/Dockerfile --build-arg SERVICE=user .
# Service chạy bằng tsx từ mã nguồn TypeScript (giống khi dev), nên image gồm cả devDependencies. Đủ cho demo;
# production thật nên biên dịch ra JavaScript và chỉ cài dependencies chạy.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
# openssl: Prisma cần để chạy query engine trên Debian slim.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable && corepack prepare pnpm@10.27.0 --activate
WORKDIR /app

# ───────── build: cài dependency và sinh Prisma client ─────────
FROM base AS build
ARG SERVICE
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
    pnpm install --frozen-lockfile --filter "@phucvi/${SERVICE}..."

COPY BE/packages/shared-library BE/packages/shared-library
COPY BE/services/${SERVICE} BE/services/${SERVICE}
# prisma generate không kết nối database nhưng cần biến URL tồn tại; gateway không có Prisma.
RUN if [ -f "BE/services/${SERVICE}/prisma/schema.prisma" ]; then \
      cd "BE/services/${SERVICE}" \
      && env "$(echo "${SERVICE}" | tr 'a-z' 'A-Z')_DATABASE_URL=postgresql://build:build@localhost:5432/build" \
         node node_modules/prisma/build/index.js generate; \
    fi

# ───────── runtime ─────────
FROM base AS runtime
ARG SERVICE
ENV SERVICE=${SERVICE}
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app /app
COPY --chown=node:node BE/infra/docker/entrypoint.sh /entrypoint.sh
# Phòng checkout trên Windows làm script có CRLF.
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh
# Thư mục ảnh tải lên (catalog gắn volume vào đây); tạo sẵn và giao cho user node để volume mới nhận đúng quyền ghi.
RUN mkdir -p /data/uploads && chown node:node /data/uploads
USER node
ENTRYPOINT ["/entrypoint.sh"]
