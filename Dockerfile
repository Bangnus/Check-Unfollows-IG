# ใช้ Node.js เวอร์ชัน 18 (เสถียรที่สุดสำหรับ Puppeteer)
FROM node:18-slim

# 1. ติดตั้ง Google Chrome Stable และ dependencies ที่จำเป็น
# การติดตั้ง Chrome ตัวเต็มลงใน Docker จะเสถียรกว่าใช้ Chromium แบบย่อบน Vercel มาก
RUN apt-get update \
    && apt-get install -y wget gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 2. ตั้งค่า Environment Variable
# บอก Puppeteer ว่าไม่ต้องโหลด Chromium มาเอง ให้ใช้ตัวที่เราลงไว้
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
ENV NODE_ENV=production

# 3. เตรียมโฟลเดอร์งาน
WORKDIR /app

# 4. Copy ไฟล์ package และติดตั้ง dependencies
COPY package*.json ./
RUN npm install

# 5. Copy โค้ดทั้งหมด
COPY . .

# 6. Build Next.js
RUN npm run build

# 7. เปิด Port 3000
EXPOSE 3000

# 8. สั่งรันเว็บ
CMD ["npm", "start"]