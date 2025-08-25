# Sử dụng Node.js LTS
FROM node:22 AS builder

# Cài đặt nano
RUN apt update && apt install -y nano

# Đặt thư mục làm việc
WORKDIR /app

# Copy package.json trước để tận dụng cache
COPY package*.json ./

# Cài đặt chỉ các dependencies cần thiết
RUN npm install --omit=dev --legacy-peer-deps
RUN npm install --force

# Copy toàn bộ source code vào container
COPY . .  

# Cài đặt dependencies cho spl-token trong vendor
RUN cd vendor/spl-token-0.4.13 && npm install

# Build NestJS
RUN npm run build

# Stage 2: Chạy ứng dụng trong image nhỏ gọn hơn
FROM node:22 AS runner

# Đặt thư mục làm việc
WORKDIR /app

# Copy file cần thiết từ stage build
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Copy vendor directory và node_modules của spl-token
COPY --from=builder /app/vendor ./vendor
COPY --from=builder /app/vendor/spl-token-0.4.13/node_modules ./vendor/spl-token-0.4.13/node_modules

# # Copy file .env vào container
# COPY --from=builder /app/.env .env

# Expose cổng chạy server
EXPOSE 8000

# Chạy ứng dụng
CMD ["node", "dist/src/main.js"]