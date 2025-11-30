import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 1. รายชื่อแพ็คเกจที่ห้าม Build (ให้ใช้แบบ Server Node.js)
  serverExternalPackages: [
    "puppeteer",
    "puppeteer-core",
    "puppeteer-extra",
    "puppeteer-extra-plugin-stealth",
    "@sparticuz/chromium",
    "clone-deep",
    "merge-deep",
    "fs-extra",
    "graceful-fs",
    "rimraf",
    "glob",
  ],

  // 2. ย้ายมาตรงนี้! (ไม่อยู่ใน experimental แล้ว)
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/puppeteer-extra-plugin-stealth/**/*"],
  },

  images: {
    domains: ["instagram.com", "scontent.cdninstagram.com"],
  },

  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  // 3. ปล่อยว่างไว้ หรือลบทิ้งก็ได้
  experimental: {},
};

export default nextConfig;