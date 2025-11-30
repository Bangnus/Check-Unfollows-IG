import { Page } from "puppeteer";
import { NextRequest, NextResponse } from "next/server";
import { getPageInstance } from "@/app/browser-instance";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

interface InstagramUser {
  username: string;
  fullName: string;
  profilePic: string | null;
  profileLink: string | null;
}

// --- Helper Functions ---

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function simulateMouseMovement(page: Page) {
  try {
    const mouseMoveDuration = Math.floor(Math.random() * 1500) + 1000;
    const x = Math.floor(Math.random() * 1280);
    const y = Math.floor(Math.random() * 800);
    await page.mouse.move(x, y, { steps: Math.floor(Math.random() * 3) + 3 });
    await page.mouse.move(x, y, { steps: Math.floor(Math.random() * 3) + 3 });
    await delay(mouseMoveDuration);
  } catch (e) {
    /* ignore */
  }
}

// --- Login Logic (Optimized for Render) ---

async function loginInstagram(
  page: Page,
  username: string,
  password: string
): Promise<{ success: boolean; reason?: string }> {
  try {
    // 🛠️ IMPORTANT: บังคับ Viewport เป็น Desktop
    await page.setViewport({ width: 1920, height: 1080 });

    console.log("🌍 Navigating to Instagram login page...");
    try {
      await page.goto("https://www.instagram.com/accounts/login/", {
        waitUntil: "networkidle2",
        timeout: 60000,
      });
    } catch (navError) {
      console.error("⚠️ Navigation error (retrying):", navError);
      await page.reload({ waitUntil: "networkidle2" });
    }

    if (page.isClosed()) throw new Error("Page closed unexpectedly");
    await simulateMouseMovement(page);

    // 🍪 Handle Cookies
    try {
      const cookieBtn = await page.$x(
        "//button[contains(text(), 'Allow all cookies') | contains(text(), 'Decline optional cookies') | contains(text(), 'Accept') | contains(text(), 'Allow')]"
      );
      if (cookieBtn.length > 0) {
        console.log("🍪 Found cookie button, clicking...");
        await (cookieBtn[0] as any).click();
        await delay(2000);
      }
    } catch (e) {}

    console.log("⌨️ Typing username...");

    // ✅ Loop หา Input หลายๆ แบบ (แก้ปัญหาหาช่องไม่เจอ)
    const usernameSelectors = [
      'input[name="username"]',
      'input[aria-label="Phone number, username, or email"]',
      'input[aria-label="หมายเลขโทรศัพท์ ชื่อผู้ใช้ หรืออีเมล"]', // ภาษาไทย
      'input[type="text"]',
      'input[type="email"]',
      "#loginForm input",
    ];

    let foundInput = false;
    for (const selector of usernameSelectors) {
      try {
        const input = await page.waitForSelector(selector, {
          timeout: 2000,
          visible: true,
        });
        if (input) {
          console.log(`✅ Found username input: ${selector}`);
          await input.type(username, { delay: 100 });
          foundInput = true;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!foundInput) {
      const title = await page.title();
      throw new Error(
        `Could not find ANY username input field. Page Title: ${title}`
      );
    }

    console.log("⌨️ Typing password...");
    const passwordSelector = 'input[name="password"]';
    await page.waitForSelector(passwordSelector, { timeout: 30000 });
    await page.type(passwordSelector, password, { delay: 100 });

    await simulateMouseMovement(page);

    console.log("🖱️ Clicking submit...");
    const submitSelector = 'button[type="submit"]';
    await page.waitForSelector(submitSelector, { timeout: 30000 });
    await page.click(submitSelector);

    console.log("⏳ Waiting for navigation...");
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 });

    const pageContent = await page.content();
    if (pageContent.includes("Sorry, your password was incorrect")) {
      return { success: false, reason: "Incorrect password" };
    }
    if (pageContent.includes("Suspicious login attempt")) {
      return { success: false, reason: "Suspicious login attempt blocked" };
    }
    if (pageContent.includes("Help us confirm it's you")) {
      return { success: false, reason: "Security Challenge Required" };
    }

    // Verify Login
    const homeSelector = 'svg[aria-label="Home"]';
    try {
      await page.waitForSelector(homeSelector, { timeout: 15000 });
      return { success: true };
    } catch {
      return {
        success: false,
        reason: "Login verification failed (Home icon not found)",
      };
    }
  } catch (error: any) {
    console.error("🚨 Login error:", error);
    return { success: false, reason: `Login Error: ${error.message}` };
  }
}

// --- Scraping Logic ---

async function scrapeUsersFromDialog(
  page: Page,
  startTime: number
): Promise<InstagramUser[]> {
  const collectedUsers: InstagramUser[] = [];
  const collectedUsernames = new Set<string>();
  let previousUsersCount = 0;
  let attempts = 0;
  let attemptNoNewUsers = 0;
  const maxAttempts = 300;

  // Render รันได้นาน ให้ 10 นาที
  const TIME_LIMIT = process.env.NODE_ENV === "production" ? 600000 : 300000;

  try {
    await page.waitForSelector('div[role="dialog"]', { timeout: 10000 });
  } catch {
    console.error("❌ Dialog not found!");
    return [];
  }

  // Mark scrollable area
  await page.evaluate(() => {
    const dialog = document.querySelector('div[role="dialog"]');
    if (dialog) {
      const scrollable = Array.from(dialog.querySelectorAll("div")).find(
        (el) => {
          const style = window.getComputedStyle(el);
          return style.overflowY === "auto" || style.overflowY === "scroll";
        }
      );
      if (scrollable) scrollable.classList.add("custom-scroll-target");
      else {
        const list = dialog.querySelector('div[style*="height"]');
        if (list) list.parentElement?.classList.add("custom-scroll-target");
      }
    }
  });

  while (attempts < maxAttempts) {
    if (Date.now() - startTime > TIME_LIMIT) {
      console.warn(`⏳ Time limit reached!`);
      break;
    }

    attempts++;
    console.log(
      `🔄 Attempt: ${attempts}, Users collected: ${collectedUsers.length}`
    );

    // Wait for links
    try {
      await page.waitForFunction(
        () =>
          document.querySelectorAll('div[role="dialog"] a[role="link"]')
            .length > 0,
        { timeout: 2000 }
      );
    } catch {
      /* ignore */
    }

    await delay(200 + Math.random() * 200);

    // Extract Users
    const users = await page.evaluate((existingUsernames) => {
      const newUsers: InstagramUser[] = [];
      const foundUsernames = new Set(existingUsernames);
      const links = document.querySelectorAll(
        'div[role="dialog"] a[role="link"]'
      );

      links.forEach((link) => {
        const href = link.getAttribute("href");
        if (!href) return;
        const username = href.replace(/\//g, "");
        if (!username || username === "explore" || username === "reels") return;

        if (!foundUsernames.has(username)) {
          foundUsernames.add(username);
          newUsers.push({
            username: username,
            fullName: "",
            profilePic: null,
            profileLink: `https://www.instagram.com/${username}`,
          });
        }
      });
      return newUsers;
    }, Array.from(collectedUsernames));

    for (const user of users) {
      if (!collectedUsernames.has(user.username)) {
        collectedUsernames.add(user.username);
        collectedUsers.push(user);
      }
    }

    await delay(100);

    // Scroll Logic
    const scrollSuccess = await page.evaluate(async () => {
      let scrollContainer = document.querySelector(
        ".custom-scroll-target"
      ) as HTMLElement;
      if (!scrollContainer) {
        const dialog = document.querySelector('div[role="dialog"]');
        if (dialog) {
          const divs = Array.from(dialog.querySelectorAll("div"));
          scrollContainer = divs.reduce(
            (max, cur) => (cur.scrollHeight > max.scrollHeight ? cur : max),
            divs[0]
          ) as HTMLElement;
        }
      }

      if (!scrollContainer) return false;

      const previousHeight = scrollContainer.scrollHeight;
      scrollContainer.scrollBy(0, 1500);

      let retries = 0;
      while (scrollContainer.scrollHeight === previousHeight && retries < 15) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        retries++;
      }
      return scrollContainer.scrollHeight > previousHeight;
    });

    if (!scrollSuccess) {
      // Fallback: Mouse Wheel
      const dialogBox = await page.$('div[role="dialog"]');
      if (dialogBox) {
        const box = await dialogBox.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.wheel({ deltaY: 1000 });
          await delay(500);
        }
      }
    } else {
      await delay(200);
    }

    const newUserCount = collectedUsers.length;
    if (newUserCount <= previousUsersCount) {
      attemptNoNewUsers++;
    } else {
      attemptNoNewUsers = 0;
    }

    if (attemptNoNewUsers >= 5) {
      console.log("📌 No new users loaded for 5 attempts, stopping...");
      break;
    }
    previousUsersCount = newUserCount;
  }
  return collectedUsers;
}

async function closeDialog(page: Page) {
  try {
    console.log("❎ Closing dialog...");
    await page.evaluate(() => {
      const closeBtn =
        document.querySelector(
          'div[role="dialog"] button[aria-label="Close"]'
        ) || document.querySelector('div[role="dialog"] button');
      if (closeBtn) (closeBtn as HTMLElement).click();
    });
    await delay(1000);
  } catch {
    /* ignore */
  }
}

async function scrapeUserList(
  page: Page,
  type: "following" | "followers",
  clientuser: string,
  startTime: number
): Promise<InstagramUser[]> {
  try {
    console.log(`🔄 Loading ${type} for ${clientuser}`);
    await page.goto(`https://www.instagram.com/${clientuser}/`, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    const linkSelector = `a[href*="/${type}"]`;
    try {
      await page.waitForSelector(linkSelector, { timeout: 5000 });
    } catch {
      console.error(`❌ Could not find link for ${type}.`);
      return [];
    }

    await page.click(linkSelector);
    await page.waitForSelector('div[role="dialog"]', { timeout: 10000 });
    await delay(1000);

    const users = await scrapeUsersFromDialog(page, startTime);
    await closeDialog(page);
    return users;
  } catch (error) {
    console.error(`🚨 Error scraping ${type}:`, error);
    await closeDialog(page);
    return [];
  }
}

// --- Main Handler ---

export const POST = async (req: NextRequest) => {
  let page: Page | null = null;

  try {
    console.log("API Request Received");
    const body = await req.json();
    console.log("📦 Request Body:", body);
    const { username, password, clientuser } = body;

    const targetUser = clientuser || username;

    if (!targetUser) {
      return NextResponse.json(
        { error: "Target user (clientuser or username) is required." },
        { status: 400 }
      );
    }

    console.log("🔐 Logging in to Instagram...");
    page = await getPageInstance(); // จะใช้ Chrome จาก Render อัตโนมัติ

    // 1. LOGIN
    const loginResult = await loginInstagram(page, username, password);
    if (!loginResult.success) {
      console.error(`❌ Login Failed: ${loginResult.reason}`);

      // 📸 Screenshot logic for Login Failure
      if (page && !page.isClosed()) {
        try {
          const screenshotBuffer = await page.screenshot();
          await page.close();
          return new Response(screenshotBuffer as any, {
            status: 401,
            headers: { "Content-Type": "image/png" },
          });
        } catch (err) {}
      }
      return NextResponse.json({ error: loginResult.reason }, { status: 401 });
    }

    // 2. SCRAPING
    console.log(`📥 Scraping following & followers for ${targetUser}...`);
    const startTime = Date.now();

    const following = await scrapeUserList(
      page,
      "following",
      targetUser,
      startTime
    );
    await delay(1000);

    const followers = await scrapeUserList(
      page,
      "followers",
      targetUser,
      startTime
    );
    await delay(1000);

    // 3. COMPARE
    const notFollowingBack = following.filter(
      (f) => !followers.some((fol) => fol.username === f.username)
    );

    // Close clean up
    if (page && !page.isClosed()) {
      await page.close();
    }

    return NextResponse.json(
      {
        notFollowingBack,
        stats: {
          followingCount: following.length,
          followersCount: followers.length,
          notFollowingBackCount: notFollowingBack.length,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Critical Error:", error);

    // 📸 Screenshot logic for Critical Error
    if (page && !page.isClosed()) {
      try {
        const screenshotBuffer = await page.screenshot({ fullPage: true });
        await page.browser().close();
        return new Response(screenshotBuffer as any, {
          status: 500,
          headers: { "Content-Type": "image/png" },
        });
      } catch (err) {}
    }

    return NextResponse.json(
      {
        error: error.message || "Internal Server Error",
        details: error.toString(),
      },
      { status: 500 }
    );
  }
};
