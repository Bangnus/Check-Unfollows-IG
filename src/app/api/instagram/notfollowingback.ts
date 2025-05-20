import puppeteer, { Browser, Page } from "puppeteer";
import { NextRequest, NextResponse } from "next/server";
import { getPageInstance } from "@/app/browser-instance";
let currentSession: { page: Page | null } = { page: null }; // เก็บ session

interface InstagramUser {
    username: string;
    fullName: string;
    profilePic: string | null;
    profileLink: string | null
}

async function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function simulateMouseMovement(page: Page) {
    const mouseMoveDuration = Math.floor(Math.random() * 1500) + 1000;
    const x = Math.floor(Math.random() * 1280);
    const y = Math.floor(Math.random() * 800);
    await page.mouse.move(x, y, { steps: Math.floor(Math.random() * 3) + 3 });
    await delay(mouseMoveDuration);
}

async function loginInstagram(page: Page, username: string, password: string): Promise<boolean> {
    try {
        await page.goto("https://www.instagram.com/accounts/login/", {
            waitUntil: "networkidle2",
            timeout: 20000
        });

        await simulateMouseMovement(page);
        await page.type('input[name="username"]', username, {
            delay: Math.random() * 200 + 100
        });
        await page.type('input[name="password"]', password, {
            delay: Math.random() * 200 + 100
        });

        await simulateMouseMovement(page);
        await page.click('button[type="submit"]');

        await page.waitForNavigation({
            waitUntil: "networkidle2",
            timeout: 30000
        });

        const pageContent = await page.content();
        if (pageContent.includes("Sorry, your password was incorrect") ||
            pageContent.includes("Suspicious login attempt")) {
            return false;
        }
        return true;
    } catch (error) {
        console.error("Login error:", error);
        return false;
    }
}



// ดึงข้อมูลผู้ใช้งานจากหน้าต่าง dialog
async function scrapeUsersFromDialog(page: Page): Promise<InstagramUser[]> {
    let collectedUsers: InstagramUser[] = [];
    let collectedUsernames = new Set<string>(); // ใช้ Set เพื่อเก็บ username ที่ไม่ซ้ำ
    let previousUsersCount = 0;
    let attempts = 0;
    let attemptNoNewUsers = 0;
    const maxAttempts = 300;

    await page.evaluate(() => {
        const dialog = document.querySelector('div[role="dialog"] .x1rife3k');
        if (dialog) {
            (dialog as HTMLElement).style.overflowY = "scroll";
        }
    });

    while (attempts < maxAttempts) {
        attempts++;
        console.log(`🔄 Attempt: ${attempts}, Users collected: ${collectedUsers.length}`);

        await page.waitForFunction(() => {
            const users = document.querySelectorAll('div[role="dialog"] a[role="link"]');
            return users.length > 0;
        }, { timeout: 10000 });

        await delay(4000 + Math.random() * 2000);

        // ✅ ดึงข้อมูลจากหน้าเว็บพร้อมใช้ `Set` เพื่อกรองซ้ำตั้งแต่ต้น
        const users = await page.evaluate((existingUsernames) => {
            const newUsers: InstagramUser[] = [];
            const foundUsernames = new Set(existingUsernames); // ใช้ Set เช็คซ้ำ

            document.querySelectorAll('div[role="dialog"] a[role="link"]').forEach(link => {
                const img = link.querySelector("img") || link.closest("div")?.querySelector("img");
                const username = link.getAttribute("href")?.replace("/", "") || "";

                if (!foundUsernames.has(username)) { // ✅ ตรวจสอบว่าซ้ำหรือไม่
                    foundUsernames.add(username);
                    newUsers.push({
                        username: username,
                        fullName: link.querySelector("span")?.textContent?.trim() ||
                            link.closest("div")?.querySelector("span")?.textContent?.trim() || "",
                        profilePic: img ? img.getAttribute("src") : null,
                        profileLink: username ? `https://www.instagram.com/${username}` : null,
                    });
                }
            });

            return newUsers;
        }, Array.from(collectedUsernames)); // ✅ ส่ง `collectedUsernames` ไปช่วยกรองซ้ำใน evaluate

        // ✅ ถ้าได้ผู้ใช้ใหม่ ก็นำเข้า `Set` และ `Array`
        for (const user of users) {
            collectedUsernames.add(user.username);
            collectedUsers.push(user);
        }

        console.log(`✅ New Users Collected: ${users.length}`);
        console.log(`🔄 Duplicates skipped (not added): ${collectedUsers.length - collectedUsernames.size}`);

        await delay(3000 + Math.random() * 2000);

        const scrollSuccess = await page.evaluate(async () => {
            const scrollContainer = document.querySelector('div[role="dialog"] .x1rife3k');
            if (!scrollContainer) return false;

            const beforeScroll = scrollContainer.scrollTop;
            scrollContainer.scrollBy(0, -300);
            await new Promise(resolve => setTimeout(resolve, 2000));
            scrollContainer.scrollBy(0, Math.floor(Math.random() * 1000) + 1500);
            await new Promise(resolve => setTimeout(resolve, 5000));

            return scrollContainer.scrollTop !== beforeScroll;
        });

        if (!scrollSuccess) {
            console.log("⚠️ Scroll did not work, trying mouse wheel...");
            await page.mouse.wheel({ deltaY: Math.floor(Math.random() * 1000) + 1500 });
            await delay(5000);
        }

        await delay(5000 + Math.random() * 3000);

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

    console.log(`🎉 Finished scraping. Total unique users collected: ${collectedUsers.length}`);
    return collectedUsers;
}

async function closeDialog(page: Page) {
    try {
        await page.evaluate(() => {
            const closeBtn = document.querySelector('div[role="dialog"] button[aria-label="Close"]') ||
                document.querySelector('div[role="dialog"] svg[aria-label="Close"]')?.closest('button');
            if (closeBtn) (closeBtn as HTMLElement).click();
        });
        await delay(3000);
    } catch (error) {
        console.log("⚠️ Could not close dialog, continuing...");
    }
}

async function scrapeUserList(page: Page, type: "following" | "followers", clientuser: string): Promise<InstagramUser[]> {
    try {
        console.log(`🔄 Loading ${type} for ${clientuser}`);
        await page.goto(`https://www.instagram.com/${clientuser}/`, { waitUntil: "load", timeout: 60000 });

        await page.waitForSelector(`a[href="/${clientuser}/${type}/"]`, { timeout: 10000 });

        // คลิกปุ่มเพื่อเข้าไปดู following/followers
        await page.evaluate((type, clientuser) => {
            const button = document.querySelector(`a[href="/${clientuser}/${type}/"]`);
            if (button) (button as HTMLElement).click();
        }, type, clientuser);

        await page.waitForSelector('div[role="dialog"]', { timeout: 10000 });
        await page.waitForSelector('div[role="dialog"] a[role="link"]', { timeout: 10000 });

        // รอสักครู่ก่อนเริ่มดึงข้อมูล
        await delay(1000);

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
        const body = await req.json();
        const { username, password, clientuser } = body;

        if (!clientuser) {
            // 📌 กรณีล็อกอิน (ครั้งแรก ต้องใส่ username + password)
            if (!username || !password) {
                return NextResponse.json(
                    { error: "Username and Password are required for first login." },
                    { status: 400 }
                );
            }

            console.log("🔐 Logging in to Instagram...");
            const page = await getPageInstance();
            await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

            const loginSuccess = await loginInstagram(page, username, password);
            if (!loginSuccess) {
                return NextResponse.json(
                    { error: "Login failed. Invalid credentials or security check." },
                    { status: 401 }
                );
            }

            currentSession.page = page; // ✅ เก็บ session
            return NextResponse.json({ message: "Login successful. You can now fetch data." }, { status: 200 });
        }

        // 📌 กรณีดึงข้อมูล (ครั้งที่ 2 ต้องใส่ clientuser)
        if (!currentSession.page) {
            return NextResponse.json(
                { error: "Session expired. Please log in again." },
                { status: 403 }
            );
        }

        const page = currentSession.page;
        console.log(`📥 Scraping following & followers for ${clientuser}...`);

        const following = await scrapeUserList(page, "following", clientuser);
        await delay(3000);
        const followers = await scrapeUserList(page, "followers", clientuser);
        await delay(3000);

        const notFollowingBack = following.filter(f =>
            !followers.some(fol => fol.username === f.username)
        );

        return NextResponse.json({
            following,
            followers,
            notFollowingBack,
            stats: {
                followingCount: following.length,
                followersCount: followers.length,
                notFollowingBackCount: notFollowingBack.length
            }
        }, { status: 200 });

    } catch (error) {
        console.error("🚨 Error:", error);
        currentSession.page = null; // ❌ ถ้า error, รีเซ็ต session
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
};
