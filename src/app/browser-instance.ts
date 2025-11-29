import puppeteer from "puppeteer-extra";
import { Browser, Page, LaunchOptions } from "puppeteer";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { addExtra } from "puppeteer-extra";

import { config } from "@/app/config";
import chromium from "@sparticuz/chromium";
import puppeteerCore from "puppeteer-core";

// ✅ เปิดใช้งาน Stealth Plugin เพื่อลดการตรวจจับ Puppeteer (สำหรับ Local)
puppeteer.use(StealthPlugin());

// ✅ Wrap puppeteer-core เพื่อใช้ Stealth Plugin (สำหรับ Production)
const puppeteerCoreExtra = addExtra(puppeteerCore);
puppeteerCoreExtra.use(StealthPlugin());

let browserInstance: Browser | null = null;
let pageInstance: Page | null = null;
let lastActivityTime: number = Date.now();
let refreshInterval: NodeJS.Timeout | null = null;

/**
 * ✅ สร้างหรือดึง instance ของ Browser
 * - รีเฟรช session ทุก 3 ชั่วโมงหากไม่มีการใช้งาน
 * - ตั้งค่าการทำงานแบบไม่ให้ถูกตรวจจับ
 * - ใช้ Proxy server หากมีการตั้งค่า
 */
export const getBrowserInstance = async (): Promise<Browser> => {
  // ตรวจสอบว่า Browser ค้างเกิน 3 ชั่วโมงหรือไม่
  if (browserInstance && Date.now() - lastActivityTime > 3 * 60 * 60 * 1000) {
    await closeInstances();
  }

  if (!browserInstance || !(await isBrowserConnected(browserInstance))) {
    // ✅ Check VERCEL env to ensure we only use this mode in actual production environment
    if (process.env.NODE_ENV === "production" && process.env.VERCEL) {
      // 🚀 Production Mode (Vercel / Serverless)
      console.log(
        "🚀 Launching in Production Mode (Puppeteer Core + Chromium)"
      );

      // Configure Chromium
      chromium.setGraphicsMode = false;

      // Launch with puppeteer-core (Wrapped with Stealth)
      browserInstance = (await puppeteerCoreExtra.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
        ignoreHTTPSErrors: true,
      } as any)) as unknown as Browser;
    } else {
      // 🛠️ Development Mode (Local Puppeteer)
      console.log("🛠️ Launching in Development Mode (Standard Puppeteer)");

      const launchOptions: any = {
        headless: config.HEADLESS,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--disable-gpu",
          "--disable-web-security",
          "--disable-features=IsolateOrigins,site-per-process",
          "--disable-blink-features=AutomationControlled",
          `--proxy-server=${config.PROXY_SERVER || ""}`,
        ],
        ignoreHTTPSErrors: true,
      };

      browserInstance = await puppeteer.launch(launchOptions);
    }

    setupRefreshInterval(); // รีเซ็ต interval ทุกครั้งที่สร้าง Browser ใหม่
  }

  lastActivityTime = Date.now();
  return browserInstance;
};

/**
 * ✅ สร้างหรือดึง instance ของ Page
 * - ตั้งค่า User-Agent และ Viewport แบบสุ่ม
 * - ซ่อน Puppeteer จากการตรวจจับของเว็บไซต์
 */
export const getPageInstance = async (): Promise<Page> => {
  const browser = await getBrowserInstance();

  if (!pageInstance || pageInstance.isClosed()) {
    pageInstance = await browser.newPage();

    // ตั้งค่า User-Agent (Fixed Modern UA)
    const userAgent =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
    await pageInstance.setUserAgent(userAgent);

    // ตั้งค่า Viewport แบบสุ่ม
    // ตั้งค่า Viewport แบบ Desktop
    await pageInstance.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
    });

    // ซ่อน Puppeteer จากการถูกตรวจจับ
    await pageInstance.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });
    });
  }

  lastActivityTime = Date.now();
  return pageInstance;
};

/**
 * ✅ ปิด Browser และ Page instance ทั้งหมด
 * - ป้องกัน resource leak โดยล้างค่า instance
 * - ล้าง interval ที่ใช้ตรวจสอบการใช้งาน
 */
export const closeInstances = async (): Promise<void> => {
  if (pageInstance && !pageInstance.isClosed()) {
    await pageInstance.close();
    pageInstance = null;
  }

  if (browserInstance && (await isBrowserConnected(browserInstance))) {
    await browserInstance.close();
    browserInstance = null;
  }

  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
};

/**
 * ✅ ตรวจสอบว่า Browser ยังเปิดอยู่หรือไม่
 * - ใช้การตรวจสอบ process เพื่อเพิ่มความแม่นยำ
 */
async function isBrowserConnected(browser: Browser): Promise<boolean> {
  try {
    const browserProcess = browser.process();
    return !!browserProcess && !browserProcess.killed;
  } catch {
    return false;
  }
}

/**
 * ✅ ตั้งค่า Interval เพื่อตรวจสอบ inactivity และรีเฟรช session
 * - ปิด Browser อัตโนมัติหากไม่มีการใช้งานเกิน 30 นาที
 */
function setupRefreshInterval(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }

  refreshInterval = setInterval(async () => {
    if (browserInstance && Date.now() - lastActivityTime > 30 * 60 * 1000) {
      console.log("🔄 Refreshing session due to inactivity...");
      await closeInstances();
    }
  }, 5 * 60 * 1000); // ตรวจสอบทุก 5 นาที
}

// ✅ ปิด Browser ก่อนที่โปรแกรมจะจบการทำงาน
process.on("beforeExit", async () => {
  await closeInstances();
});
