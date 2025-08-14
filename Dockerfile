# ใช้ Node.js LTS
FROM node:20-alpine

# เพื่อความเข้ากันได้ของ Prisma บน Alpine
RUN apk add --no-cache openssl

# กำหนด Working Directory
WORKDIR /app

# คัดลอก package.json และ lock file
COPY package*.json ./

# ติดตั้ง dependencies (ใช้ ci เพื่อความเสถียร)
RUN npm ci

# คัดลอก schema ของ Prisma แล้ว generate client ก่อน build
COPY prisma ./prisma
RUN npx prisma generate

# คัดลอกโค้ดทั้งหมด
COPY . .

# Build โปรเจกต์ (Next.js)
RUN npm run build

# เปิดพอร์ตที่ต้องการ
EXPOSE 8000

# รันด้วย production mode
CMD ["npm", "run", "start", "--", "-p", "8000"]