# ใช้ Node.js LTS
FROM node:20-alpine

# กำหนด Working Directory
WORKDIR /app

# คัดลอก package.json และ lock file
COPY package*.json ./

# ติดตั้ง dependencies
RUN npm install

# คัดลอกโค้ดทั้งหมด
COPY . .

# Build โปรเจกต์ (Next.js)
RUN npm run build

# เปิดพอร์ตที่ต้องการ
EXPOSE 8000

# รันด้วย production mode
CMD ["npm", "run", "start", "--", "-p", "8000"]