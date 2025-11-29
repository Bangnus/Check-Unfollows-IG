import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // serverExternalPackages สำหรับ Next.js 15 (แก้ Build Error)
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

  // --- ส่วนที่เพิ่มใหม่เพื่อแก้ Runtime Error ---
  experimental: {
    // บังคับให้ Vercel copy โฟลเดอร์ของ plugin stealth ไปที่ server ด้วย
    outputFileTracingIncludes: {
      "/api/**/*": [
        path.join(
          process.cwd(),
          "node_modules",
          "puppeteer-extra-plugin-stealth",
          "**",
          "*"
        ),
      ],
    },
  } as any,
};

export default nextConfig;
