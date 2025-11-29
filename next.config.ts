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
    domains: [
      "example.com", 
      "instagram.com"
    ], // อนุญาตให้โหลดรูปจากโดเมนนี้
  },
  experimental: {

  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
