import { Page } from "puppeteer";
import { NextRequest, NextResponse } from "next/server";
import { getPageInstance } from "@/app/browser-instance";

// ✅ ใช้ globalThis เพื่อป้องกัน Session หายตอน Dev (Hot Reload)
export const maxDuration = 60; // 60 seconds (max for Vercel Hobby)
const globalForPuppeteer = globalThis as unknown as {
  currentSession: { page: Page | null };
};
const currentSession = globalForPuppeteer.currentSession || { page: null };
if (process.env.NODE_ENV !== "production")
  globalForPuppeteer.currentSession = currentSession;

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
  await delay(mouseMoveDuration);
}

async function loginInstagram(
  page: Page,
  username: string,
  password: string
): Promise<boolean> {
  try {
    console.log("🌍 Navigating to Instagram login page...");
    await page.goto("https://www.instagram.com/accounts/login/", {
      waitUntil: "networkidle2",
      timeout: 60000, // เพิ่ม timeout
    });

    await simulateMouseMovement(page);

    // 🍪 Handle Cookie Consent (European IPs / Vercel often see this)
    try {
      const cookieSelector = "button._a9--._a9_0"; // Common "Allow" button class
      const cookieTextSelectors = [
        "//button[contains(text(), 'Allow all cookies')]",
        "//button[contains(text(), 'Decline optional cookies')]",
        "//button[contains(text(), 'Accept')]",
        "//button[contains(text(), 'Allow')]",
      ];

      // Check for class-based button first
      if ((await page.$(cookieSelector)) !== null) {
        console.log("🍪 Found cookie button by class, clicking...");
        await page.click(cookieSelector);
        await delay(2000);
      } else {
        // Check for text-based buttons
        for (const xpath of cookieTextSelectors) {
          try {
            const clicked = await page.evaluate((xp) => {
              const result = document.evaluate(
                xp,
                document,
                null,
                9, // XPathResult.FIRST_ORDERED_NODE_TYPE
                null
              );
              const node = result.singleNodeValue;
              if (node && node instanceof HTMLElement) {
                node.click();
                return true;
              }
              return false;
            }, xpath);

            if (clicked) {
              console.log(
                `🍪 Found cookie button by text (${xpath}), clicking...`
              );
              await delay(2000);
              break;
            }
          } catch (err) {
            // Ignore errors for individual xpaths
          }
        }
      }
    } catch (e) {
      console.log("⚠️ Error handling cookies (might not be present):", e);
    }

    console.log("⌨️ Typing username...");
    // Try multiple selectors for username
    const usernameSelectors = [
      'input[name="username"]',
      'input[aria-label="Phone number, username, or email"]',
      'input[type="text"]',
    ];
    let usernameInput;
    for (const selector of usernameSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 10000 });
        usernameInput = selector;
        console.log(`✅ Found username input: ${selector}`);
        break;
      } catch {
        continue;
      }
    }

    if (!usernameInput) {
      throw new Error("Could not find username input field");
    }

    await page.type(usernameInput, username, {
      delay: Math.random() * 200 + 100,
    });

    console.log("⌨️ Typing password...");
    const passwordSelector = 'input[name="password"]';
    await page.waitForSelector(passwordSelector, { timeout: 30000 });
    await page.type(passwordSelector, password, {
      delay: Math.random() * 200 + 100,
    });

    await simulateMouseMovement(page);

    console.log("🖱️ Clicking submit...");
    const submitSelector = 'button[type="submit"]';
    await page.waitForSelector(submitSelector, { timeout: 30000 });
    await page.click(submitSelector);

    console.log("⏳ Waiting for navigation...");
    await page.waitForNavigation({
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    const pageContent = await page.content();
    if (
      pageContent.includes("Sorry, your password was incorrect") ||
      pageContent.includes("Suspicious login attempt")
    ) {
      console.warn(
        "❌ Login failed: Incorrect password or suspicious attempt."
      );
      return false;
    }

    // เช็คว่า login สำเร็จจริงไหม โดยดูว่ามี element ของหน้า home ไหม
    const homeSelector = 'svg[aria-label="Home"]';
    try {
      await page.waitForSelector(homeSelector, { timeout: 15000 }); // Increased timeout
      console.log("✅ Login verified by Home icon presence.");
    } catch {
      console.warn("⚠️ Could not verify login by Home icon.");

      // Log page content to see what happened (Challenge? Block? 2FA?)
      try {
        const bodyText = await page.evaluate(() => document.body.innerText);
        console.log("📄 Login Failed Page Text:", bodyText.substring(0, 500));
        const title = await page.title();
        console.log("📄 Login Failed Page Title:", title);
      } catch (e) {
        console.log("Could not get page text");
      }

      return false; // Return false if verification fails!
    }

    return true;
  } catch (error) {
    console.error("🚨 Login error:", error);
    console.log("Current URL on error:", page.url());
    try {
      const bodyText = await page.evaluate(() => document.body.innerText);
      console.log("📄 Page Text on Error:", bodyText.substring(0, 500)); // Log first 500 chars
    } catch (e) {
      console.log("Could not get page text");
    }
    return false;
  }
}

// ดึงข้อมูลผู้ใช้งานจากหน้าต่าง dialog
async function scrapeUsersFromDialog(page: Page): Promise<InstagramUser[]> {
  const collectedUsers: InstagramUser[] = [];
  const collectedUsernames = new Set<string>();
  let previousUsersCount = 0;
  let attempts = 0;
  let attemptNoNewUsers = 0;
  const maxAttempts = 300;

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
        { timeout: 5000 }
      );
    } catch {
      console.log("⚠️ Waiting for users timed out, trying to scroll anyway...");
    }

    await delay(2000 + Math.random() * 1000);

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

        // กรองพวกที่ไม่ใช่ user (เช่น location, hashtag) - ปกติ user จะไม่มี /explore/ หรืออื่นๆ
        if (username === "explore" || username === "reels") return;

        if (!foundUsernames.has(username)) {
          foundUsernames.add(username);

          // พยายามหาชื่อจริงและรูป
          // รูปมักจะอยู่ใน img tag ใน link หรือใกล้เคียง
          const img =
            link.querySelector("img") ||
            link.closest("div[role='button']")?.querySelector("img");

          // ชื่อจริงมักจะอยู่ใน span หรือ div ใกล้ๆ
          // อันนี้ยากหน่อยเพราะ structure เปลี่ยนบ่อย
          // ลองหา text ที่ไม่ใช่ username
          let fullName = "";
          const parentRow = link.closest('div[role="listitem"]'); // สมมติว่าเป็น listitem
          if (parentRow) {
            const texts = (parentRow as HTMLElement).innerText.split("\n");
            fullName =
              texts.find(
                (t) => t !== username && t !== "Follow" && t !== "Remove"
              ) || "";
          }

          newUsers.push({
            username: username,
            fullName: fullName,
            profilePic: img ? img.getAttribute("src") : null,
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

    await delay(1000 + Math.random() * 1000);

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

      const beforeScroll = scrollContainer.scrollTop;
      scrollContainer.scrollBy(0, 300 + Math.random() * 200); // Scroll ลง
      await new Promise((resolve) => setTimeout(resolve, 1000));

      return scrollContainer.scrollTop !== beforeScroll;
    });

    if (!scrollSuccess) {
      console.log("⚠️ Scroll via JS failed, trying mouse wheel...");
      // Move mouse to center of dialog
      const dialogBox = await page.$('div[role="dialog"]');
      if (dialogBox) {
        const box = await dialogBox.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.wheel({ deltaY: 500 });
        }
      }
    }

    await delay(2000 + Math.random() * 1000);

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
    await delay(2000);
  } catch {
    console.log("⚠️ Could not close dialog, continuing...");
  }
}

async function scrapeUserList(
  page: Page,
  type: "following" | "followers",
  clientuser: string
): Promise<InstagramUser[]> {
  try {
    console.log(`🔄 Loading ${type} for ${clientuser}`);
    await page.goto(`https://www.instagram.com/${clientuser}/`, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    // สร้าง Link selector
    const linkSelector = `a[href*="/${type}"]`; // ใช้ wildcard * เพื่อความชัวร์

    try {
      await page.waitForSelector(linkSelector, { timeout: 10000 });
    } catch {
      console.error(`❌ Could not find link for ${type}.`);
      console.log(`Current URL: ${page.url()}`);
      console.log(`Page Title: ${await page.title()}`);
      try {
        const bodyText = await page.evaluate(() => document.body.innerText);
        console.log("📄 Page Text on Error:", bodyText.substring(0, 500));
      } catch (e) {
        console.log("Could not get page text");
      }
      return [];
    }

    console.log(`🖱️ Clicking ${type} link...`);
    await page.click(linkSelector);

    console.log("⏳ Waiting for dialog...");
    await page.waitForSelector('div[role="dialog"]', { timeout: 15000 });

    // รอสักครู่ก่อนเริ่มดึงข้อมูล
    await delay(2000);

    // ดึงข้อมูล
    const users = await scrapeUsersFromDialog(page);

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

    let page = currentSession.page;

    // 1. ตรวจสอบว่าต้อง Login ใหม่หรือไม่
    // ถ้ามี username+password ส่งมา => พยายาม Login ใหม่ หรือใช้ session เดิมถ้ายังดีอยู่
    // แต่เพื่อความชัวร์ ถ้าส่ง creds มา เราจะเช็ค session ก่อน ถ้าไม่มีค่อย login
    if (username && password) {
      if (!page || page.isClosed()) {
        console.log("🔐 Logging in to Instagram...");
        page = await getPageInstance();

        // Set User Agent - ย้ายไปตั้งที่ launch args แล้ว
        // await page.setUserAgent(
        //   "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        // );

        const loginSuccess = await loginInstagram(page, username, password);
        if (!loginSuccess) {
          return NextResponse.json(
            { error: "Login failed. Invalid credentials or security check." },
            { status: 401 }
          );
        }
        currentSession.page = page; // Save session
      } else {
        console.log("ℹ️ Active session found, skipping login.");
      }
    } else {
      // ถ้าไม่ส่ง username/password มา ต้องมี session อยู่แล้ว
      if (!page || page.isClosed()) {
        return NextResponse.json(
          {
            error:
              "Session expired and no credentials provided. Please provide username and password.",
          },
          { status: 401 }
        );
      }
    }

    // Update page reference just in case
    page = currentSession.page!;

    // 2. เริ่ม Scrape ข้อมูล
    console.log(`📥 Scraping following & followers for ${targetUser}...`);

    const following = await scrapeUserList(page, "following", targetUser);
    await delay(3000);
    const followers = await scrapeUserList(page, "followers", targetUser);
    await delay(3000);

    const notFollowingBack = following.filter(
      (f) => !followers.some((fol) => fol.username === f.username)
    );

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
