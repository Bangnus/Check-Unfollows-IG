import puppeteer from "puppeteer-extra";
import { Browser, Page, LaunchOptions } from "puppeteer";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import randomUseragent from "random-useragent";
import { config } from "@/app/config";

// ✅ เปิดใช้งาน Stealth Plugin เพื่อลดการตรวจจับ Puppeteer
puppeteer.use(StealthPlugin());

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
        const launchOptions: LaunchOptions & { ignoreHTTPSErrors?: boolean } = {
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
                `--proxy-server=${config.PROXY_SERVER || ''}`
            ],
            ignoreHTTPSErrors: true,
        };

        browserInstance = await puppeteer.launch(launchOptions);
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

        // ตั้งค่า User-Agent แบบสุ่ม
        const userAgent = randomUseragent.getRandom();
        await pageInstance.setUserAgent(userAgent);

        // ตั้งค่า Viewport แบบสุ่ม
        await pageInstance.setViewport({
            width: 1280 + Math.floor(Math.random() * 100),
            height: 800 + Math.floor(Math.random() * 100),
            deviceScaleFactor: 1 + Math.random() * 0.5
        });

        // ซ่อน Puppeteer จากการถูกตรวจจับ
        await pageInstance.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, "webdriver", { get: () => false });
            Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
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
