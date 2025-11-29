import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // 1. ระบุ Package ที่ต้องรันบน Server เท่านั้น
  serverExternalPackages: [
    "puppeteer",
    "puppeteer-core",
    "puppeteer-extra",
    "puppeteer-extra-plugin-stealth",
    "@sparticuz/chromium",
    "clone-deep",
    "merge-deep",
  ],

  images: {
    domains: ["instagram.com", "scontent.cdninstagram.com"],
  },

  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  // 2. แก้ไขส่วนนี้: ใช้ path.join เพื่อระบุตำแหน่งไฟล์ให้แม่นยำ ไม่ให้ Path เบิ้ล
  experimental: {
    // ใส่ @ts-ignore เพื่อปิดขีดแดง
    // @ts-ignore
    outputFileTracingIncludes: {
      // ใช้ ./ นำหน้า เพื่อบอกว่าเป็น Relative Path (ไม่เอา path เต็ม)
      "/api/**/*": ["./node_modules/puppeteer-extra-plugin-stealth/**/*"],
    },
  },
};
export default nextConfig;
