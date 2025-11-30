import puppeteer from "puppeteer-extra";
import { Browser, Page } from "puppeteer";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { addExtra } from "puppeteer-extra";
import chromium from "@sparticuz/chromium";
import puppeteerCore from "puppeteer-core";
import { config } from "@/app/config"; // ตรวจสอบว่า path นี้ถูกต้องในโปรเจกต์ของคุณ

// ✅ 1. ตั้งค่า Plugin เพื่อหลบการตรวจจับ
puppeteer.use(StealthPlugin());
const puppeteerCoreExtra = addExtra(puppeteerCore);
puppeteerCoreExtra.use(StealthPlugin());

let browserInstance: Browser | null = null;
let pageInstance: Page | null = null;
let lastActivityTime: number = Date.now();
let refreshInterval: NodeJS.Timeout | null = null;

// User Agent ล่าสุด (Chrome 122) เพื่อความเนียน
const USER_AGENT_LINUX =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const USER_AGENT_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export const getBrowserInstance = async (): Promise<Browser> => {
  // รีเฟรช session ถ้าไม่มีการใช้งานนานเกิน 3 ชม.
  if (browserInstance && Date.now() - lastActivityTime > 3 * 60 * 60 * 1000) {
    await closeInstances();
  }

  if (!browserInstance || !(await isBrowserConnected(browserInstance))) {
    // ✅ ตรวจสอบสภาพแวดล้อม
    if (process.env.NODE_ENV === "production") {
      console.log("🚀 Launching in Production Mode...");

      // 🌟 HYBRID LOGIC: ตรวจสอบว่ามี Chrome ตัวเต็มติดตั้งอยู่ไหม (จาก Dockerfile)
      if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        console.log(
          "✨ Detected Custom Chrome (Render/Docker) - Using Standard Launch"
        );

        browserInstance = await puppeteer.launch({
          headless: true, // บน Render ต้องเป็น true
          executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, // ใช้ Chrome ที่ลงใน Docker
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage", // สำคัญมากสำหรับ Docker
            "--disable-accelerated-2d-canvas",
            "--disable-gpu",
            "--window-size=1920,1080", // บังคับจอใหญ่
            "--start-maximized",
            `--user-agent=${USER_AGENT_LINUX}`,
            ...(config.PROXY_SERVER
              ? [`--proxy-server=${config.PROXY_SERVER}`]
              : []),
          ],
          defaultViewport: { width: 1920, height: 1080 },
          ignoreHTTPSErrors: true,
        });
      } else {
        // Fallback: กรณีรันบน Vercel (ต้องใช้ @sparticuz/chromium)
        console.log("☁️ Detected Vercel/Lambda - Using Sparticuz Chromium");
        chromium.setGraphicsMode = false;

        browserInstance = (await puppeteerCoreExtra.launch({
          args: [
            ...chromium.args,
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--window-size=1920,1080",
            `--user-agent=${USER_AGENT_LINUX}`,
            ...(config.PROXY_SERVER
              ? [`--proxy-server=${config.PROXY_SERVER}`]
              : []),
          ],
          defaultViewport: { width: 1920, height: 1080 },
          executablePath: await chromium.executablePath(),
          headless: chromium.headless,
          ignoreHTTPSErrors: true,
        } as any)) as unknown as Browser;
      }
    } else {
      // 🛠️ Development Mode (Localhost)
      console.log("🛠️ Launching in Development Mode (Local)");

      browserInstance = await puppeteer.launch({
        headless: config.HEADLESS,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--window-size=1920,1080",
          `--user-agent=${USER_AGENT_WINDOWS}`,
          ...(config.PROXY_SERVER
            ? [`--proxy-server=${config.PROXY_SERVER}`]
            : []),
        ],
        defaultViewport: { width: 1920, height: 1080 },
        ignoreHTTPSErrors: true,
      });
    }

    setupRefreshInterval();
  }

  lastActivityTime = Date.now();
  return browserInstance;
};

export const getPageInstance = async (): Promise<Page> => {
  const browser = await getBrowserInstance();

  if (!pageInstance || pageInstance.isClosed()) {
    pageInstance = await browser.newPage();

    // ✅ บังคับเป็นจอคอมพิวเตอร์ (Desktop) สำคัญมาก!
    await pageInstance.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    });

    const ua =
      process.env.NODE_ENV === "production"
        ? USER_AGENT_LINUX
        : USER_AGENT_WINDOWS;
    await pageInstance.setUserAgent(ua);

    // Evasion Techniques
    await pageInstance.evaluateOnNewDocument(() => {
      // @ts-ignore
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      // @ts-ignore
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });
    });
  }

  lastActivityTime = Date.now();
  return pageInstance;
};

export const closeInstances = async (): Promise<void> => {
  if (pageInstance && !pageInstance.isClosed()) {
    try {
      await pageInstance.close();
    } catch {}
    pageInstance = null;
  }
  if (browserInstance && (await isBrowserConnected(browserInstance))) {
    try {
      await browserInstance.close();
    } catch {}
    browserInstance = null;
  }
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
};

async function isBrowserConnected(browser: Browser): Promise<boolean> {
  try {
    const browserProcess = browser.process();
    return !!browserProcess && !browserProcess.killed;
  } catch {
    return false;
  }
}

function setupRefreshInterval(): void {
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(async () => {
    if (browserInstance && Date.now() - lastActivityTime > 30 * 60 * 1000) {
      console.log("🔄 Refreshing session due to inactivity...");
      await closeInstances();
    }
  }, 5 * 60 * 1000);
}

process.on("beforeExit", async () => {
  await closeInstances();
});
