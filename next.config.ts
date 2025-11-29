import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // reactStrictMode: true, // เปิด Strict Mode
  // swcMinify: false, 
  serverExternalPackages: [
    "puppeteer",
    "puppeteer-core",
    "puppeteer-extra",
    "puppeteer-extra-plugin-stealth",
    "clone-deep",
    "merge-deep",
    "@sparticuz/chromium",
  ],
  images: {
    domains: ["example.com", "instagram.com"], // อนุญาตให้โหลดรูปจากโดเมนนี้
  },
  experimental: {},
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
