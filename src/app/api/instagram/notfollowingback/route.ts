import { Page } from "puppeteer";
import { NextRequest, NextResponse } from "next/server";
import { getPageInstance } from "@/app/browser-instance";

// ✅ ใช้ globalThis เพื่อป้องกัน Session หายตอน Dev (Hot Reload)
export const maxDuration = 60; // 60 seconds (max for Vercel Hobby)

interface InstagramUser {
  username: string;
  fullName: string;
  profilePic: string | null;
  profileLink: string | null;
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function simulateMouseMovement(page: Page) {
  const mouseMoveDuration = Math.floor(Math.random() * 1500) + 1000;
  const x = Math.floor(Math.random() * 1280);
  const y = Math.floor(Math.random() * 800);
  await page.mouse.move(x, y, { steps: Math.floor(Math.random() * 3) + 3 });
  await page.mouse.move(x, y, { steps: Math.floor(Math.random() * 3) + 3 });
  await delay(mouseMoveDuration);
}

async function loginInstagram(
  page: Page,
  username: string,
  password: string
): Promise<{ success: boolean; reason?: string }> {
  try {
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

    // Check if page is still valid
    if (page.isClosed()) {
      throw new Error("Page closed unexpectedly during navigation");
    }

    await simulateMouseMovement(page);

    // 🍪 Handle Cookie Consent
    try {
      const cookieSelector = "button._a9--._a9_0";
      if ((await page.$(cookieSelector)) !== null) {
        console.log("🍪 Found cookie button by class, clicking...");
        await page.click(cookieSelector);
        await delay(2000);
      } else {
        // Check for text-based buttons
        const cookieTextSelectors = [
          "//button[contains(text(), 'Allow all cookies')]",
          "//button[contains(text(), 'Decline optional cookies')]",
          "//button[contains(text(), 'Accept')]",
          "//button[contains(text(), 'Allow')]",
        ];
        for (const xpath of cookieTextSelectors) {
          try {
            const clicked = await page.evaluate((xp) => {
              const result = document.evaluate(xp, document, null, 9, null);
              const node = result.singleNodeValue;
              if (node && node instanceof HTMLElement) {
                node.click();
                return true;
              }
              return false;
            }, xpath);
            if (clicked) {
              await delay(2000);
              break;
            }
          } catch (err) {}
        }
      }
    } catch (e) {}

    console.log("⌨️ Typing username...");

    // Wait for ANY input to appear first (indicates form load)
    try {
      await page.waitForSelector("input", { timeout: 15000 });
    } catch {
      console.warn("⚠️ No inputs found on page after 15s");
    }

    const usernameSelectors = [
      'input[name="username"]',
      'input[aria-label="Phone number, username, or email"]',
      'input[type="text"]',
      'input[type="email"]',
      'input[type="tel"]',
      "label input",
      "#loginForm input",
    ];
    let usernameInput;
    for (const selector of usernameSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 3000 });
        usernameInput = selector;
        console.log(`✅ Found username input: ${selector}`);
        break;
      } catch {
        continue;
      }
    }

    if (!usernameInput) {
      const title = await page.title();
      return {
        success: false,
        reason: `Could not find username input field. Page: ${title}`,
      };
    }

    await page.type(usernameInput, username, { delay: 100 });

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

    // 🚨 Handle "Help us confirm it's you" Challenge
    if (pageContent.includes("Help us confirm it's you")) {
      console.warn("⚠️ Instagram Security Challenge Detected!");

      try {
        const clicked = await page.evaluate(() => {
          const buttons = [
            "//button[contains(text(), 'Next')]",
            "//button[contains(text(), 'Send Security Code')]",
            "//div[contains(text(), 'Next')]",
          ];
          for (const xpath of buttons) {
            const result = document.evaluate(xpath, document, null, 9, null);
            const node = result.singleNodeValue;
            if (node && node instanceof HTMLElement) {
              node.click();
              return true;
            }
          }
          return false;
        });
        if (clicked) await delay(5000);
      } catch (e) {}

      // Wait for verification
      const isProduction = process.env.NODE_ENV === "production";
      const waitTime = isProduction ? 30000 : 180000;

      try {
        await page.waitForSelector('svg[aria-label="Home"]', {
          timeout: waitTime,
        });
        console.log("✅ Verification successful!");
        return { success: true };
      } catch {
        return {
          success: false,
          reason: isProduction
            ? "Challenge timed out (Auto-check failed)"
            : "Challenge timed out (Manual check failed)",
        };
      }
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
// ดึงข้อมูลผู้ใช้งานจากหน้าต่าง dialog
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

  // ⏳ Dynamic Time Limit
  // Render.com (Production) allows longer timeouts. We set it to 10 minutes (600s).
  // Local (Development) also 5 minutes.
  const isProduction = process.env.NODE_ENV === "production";
  const TIME_LIMIT = isProduction ? 600000 : 300000;

  // Selector สำหรับ Dialog (ลองหลายแบบ)
  const dialogSelector = 'div[role="dialog"]';

  try {
    await page.waitForSelector(dialogSelector, { timeout: 10000 });
  } catch {
    console.error("❌ Dialog not found!");
    return [];
  }

  // หา element ที่ scroll ได้
  await page.evaluate(() => {
    const dialog = document.querySelector('div[role="dialog"]');
    if (dialog) {
      // พยายามหา child ที่มีความสูงมากกว่า dialog หรือมี overflow
      const scrollable = Array.from(dialog.querySelectorAll("div")).find(
        (el) => {
          const style = window.getComputedStyle(el);
          return style.overflowY === "auto" || style.overflowY === "scroll";
        }
      );
      if (scrollable) {
        scrollable.classList.add("custom-scroll-target");
      } else {
        // ถ้าหาไม่เจอ ให้ลองหาตัวที่มีความสูงเยอะๆ
        const list = dialog.querySelector('div[style*="height"]');
        if (list) list.parentElement?.classList.add("custom-scroll-target");
      }
    }
  });

  while (attempts < maxAttempts) {
    // ⏳ Check Time Limit
    if (Date.now() - startTime > TIME_LIMIT) {
      console.warn(
        `⏳ Time limit reached (${
          TIME_LIMIT / 1000
        }s)! Stopping scrape to prevent timeout.`
      );
      break;
    }

    attempts++;
    console.log(
      `🔄 Attempt: ${attempts}, Users collected: ${collectedUsers.length}`
    );

    // รอให้มี link user โหลดขึ้นมา
    try {
      await page.waitForFunction(
        () => {
          return (
            document.querySelectorAll('div[role="dialog"] a[role="link"]')
              .length > 0
          );
        },
        { timeout: 2000 } // Reduced timeout
      );
    } catch {
      console.log("⚠️ Waiting for users timed out, trying to scroll anyway...");
    }

    // Reduced delay
    await delay(200 + Math.random() * 200);

    const users = await page.evaluate((existingUsernames) => {
      const newUsers: InstagramUser[] = [];
      const foundUsernames = new Set(existingUsernames);

      // Selector ที่กว้างขึ้น
      const links = document.querySelectorAll(
        'div[role="dialog"] a[role="link"]'
      );

      links.forEach((link) => {
        const href = link.getAttribute("href");
        if (!href) return;

        const username = href.replace(/\//g, "");
        if (!username) return;

        // กรองพวกที่ไม่ใช่ user
        if (username === "explore" || username === "reels") return;

        if (!foundUsernames.has(username)) {
          foundUsernames.add(username);

          // ⚡ FAST MODE: Extract only essential data to speed up
          newUsers.push({
            username: username,
            fullName: "", // Skip heavy DOM query
            profilePic: null, // Skip heavy DOM query
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

    console.log(`✅ New Users Collected: ${users.length}`);

    // Minimal delay between collect and scroll
    await delay(100);

    // Scroll Logic
    const scrollSuccess = await page.evaluate(async () => {
      // หาตัว scroll ที่เรา mark ไว้ หรือหาใหม่
      let scrollContainer = document.querySelector(
        ".custom-scroll-target"
      ) as HTMLElement;

      if (!scrollContainer) {
        // Fallback: หา div ใน dialog ที่มีความสูงเยอะสุด
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
      scrollContainer.scrollBy(0, 1500); // Scroll down MORE

      // ⏳ Wait for height to change (Content loaded)
      // Fast check loop
      let retries = 0;
      while (scrollContainer.scrollHeight === previousHeight && retries < 15) {
        await new Promise((resolve) => setTimeout(resolve, 100)); // Check every 100ms
        retries++;
      }

      return scrollContainer.scrollHeight > previousHeight;
    });

    if (!scrollSuccess) {
      console.log(
        "⚠️ Scroll via JS didn't trigger load, trying mouse wheel..."
      );
      // Move mouse to center of dialog
      const dialogBox = await page.$('div[role="dialog"]');
      if (dialogBox) {
        const box = await dialogBox.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.wheel({ deltaY: 1000 }); // Faster wheel
          await delay(500); // Wait for load after wheel
        }
      }
    } else {
      // If scroll successful, minimal wait
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

  console.log(
    `🎉 Finished scraping. Total unique users collected: ${collectedUsers.length}`
  );
  return collectedUsers;
}

async function closeDialog(page: Page) {
  try {
    console.log("❎ Closing dialog...");
    await page.evaluate(() => {
      const closeBtn =
        document.querySelector(
          'div[role="dialog"] button[aria-label="Close"]'
        ) ||
        document
          .querySelector('div[role="dialog"] svg[aria-label="Close"]')
          ?.closest("button") ||
        document.querySelector('div[role="dialog"] button'); // Fallback

      if (closeBtn) (closeBtn as HTMLElement).click();
    });
    await delay(1000); // Reduced delay
  } catch {
    console.log("⚠️ Could not close dialog, continuing...");
  }
}

async function scrapeUserList(
  page: Page,
  type: "following" | "followers",
  clientuser: string,
  startTime: number
): Promise<InstagramUser[]> {
  try {
    // Check time before starting
    if (Date.now() - startTime > 50000) {
      console.warn(`⏳ Time limit reached before scraping ${type}. Skipping.`);
      return [];
    }

    console.log(`🔄 Loading ${type} for ${clientuser}`);
    await page.goto(`https://www.instagram.com/${clientuser}/`, {
      waitUntil: "networkidle2",
      timeout: 30000, // Reduced timeout
    });

    // สร้าง Link selector
    const linkSelector = `a[href*="/${type}"]`; // ใช้ wildcard * เพื่อความชัวร์

    try {
      await page.waitForSelector(linkSelector, { timeout: 5000 }); // Reduced timeout
    } catch {
      console.error(`❌ Could not find link for ${type}.`);
      return [];
    }

    console.log(`🖱️ Clicking ${type} link...`);
    await page.click(linkSelector);

    console.log("⏳ Waiting for dialog...");
    await page.waitForSelector('div[role="dialog"]', { timeout: 10000 });

    // รอสักครู่ก่อนเริ่มดึงข้อมูล
    await delay(1000);

    // ดึงข้อมูล
    const users = await scrapeUsersFromDialog(page, startTime);

    // ปิด dialog
    await closeDialog(page);

    console.log(`✅ Successfully scraped ${users.length} ${type}`);
    return users;
  } catch (error) {
    console.error(`🚨 Error scraping ${type}:`, error);
    await closeDialog(page);
    return [];
  }
}

export const POST = async (req: NextRequest) => {
  let page: Page | null = null;

  try {
    console.log(" API Request Received");
    const body = await req.json();
    console.log("📦 Request Body:", body);
    const { username, password, clientuser } = body;

    // กำหนด targetUser: ถ้ามี clientuser ให้ใช้, ถ้าไม่มีให้ใช้ username
    const targetUser = clientuser || username;

    if (!targetUser) {
      return NextResponse.json(
        { error: "Target user (clientuser or username) is required." },
        { status: 400 }
      );
    }

    // 🔐 Always start fresh session for Render/Docker stability
    console.log("🔐 Logging in to Instagram...");
    page = await getPageInstance();

    const loginResult = await loginInstagram(page, username, password);
    if (!loginResult.success) {
      return NextResponse.json(
        { error: loginResult.reason || "Login failed" },
        { status: 401 }
      );
    }

    // 2. เริ่ม Scrape ข้อมูล
    console.log(`📥 Scraping following & followers for ${targetUser}...`);
    const startTime = Date.now(); // Start timer

    const following = await scrapeUserList(
      page,
      "following",
      targetUser,
      startTime
    );
    await delay(1000); // Reduced delay
    const followers = await scrapeUserList(
      page,
      "followers",
      targetUser,
      startTime
    );
    await delay(1000); // Reduced delay

    const notFollowingBack = following.filter(
      (f) => !followers.some((fol) => fol.username === f.username)
    );

    // Close page after use
    if (page && !page.isClosed()) {
      await page.close();
    }

    return NextResponse.json(
      {
        // following,
        // followers,
        notFollowingBack,
        stats: {
          followingCount: following.length,
          followersCount: followers.length,
          notFollowingBackCount: notFollowingBack.length,
        },
      },
      { status: 200 }
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error("🚨 Error:", error);
    return NextResponse.json(
      {
        error: error.message || "Internal Server Error",
        details: error.toString(),
      },
      { status: 500 }
    );
  }
};
