import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 1. เพิ่มชื่อแพ็คเกจใน serverExternalPackages
  serverExternalPackages: [
    "puppeteer",
    "puppeteer-core",
    "puppeteer-extra",
    "puppeteer-extra-plugin-stealth",
    "puppeteer-extra-plugin-user-preferences", // <-- เพิ่มบรรทัดนี้
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

  experimental: {
    // @ts-ignore
    outputFileTracingIncludes: {
      "/api/**/*": [
        // 2. เพิ่ม path ของแพ็คเกจใหม่ลงไปในนี้ด้วย เพื่อบังคับ copy ขึ้น server
        "./node_modules/puppeteer-extra-plugin-stealth/**/*",
        "./node_modules/puppeteer-extra-plugin-user-preferences/**/*", // <-- เพิ่มบรรทัดนี้
      ],
    },
  },
};

export default nextConfig;