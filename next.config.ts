import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // reactStrictMode: true, // เปิด Strict Mode
  // swcMinify: true, // เปิดการ Minify ด้วย SWC
  serverExternalPackages: [
    "puppeteer-extra",
    "puppeteer-extra-plugin-stealth",
    "puppeteer",
  ],
  images: {
    domains: ["example.com"], // อนุญาตให้โหลดรูปจากโดเมนนี้
  },
  experimental: {

  },
};

export default nextConfig;
