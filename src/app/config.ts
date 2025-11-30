export const config = {
  HEADLESS: false, // เปลี่ยนเป็น true ใน production
  PROXY_SERVER: process.env.PROXY_SERVER || "",
  REQUEST_DELAY: {
    MIN: 2000,
    MAX: 5000,
  },
  SCROLL_DELAY: {
    MIN: 1000,
    MAX: 3000,
  },
  MAX_REQUESTS_PER_HOUR: 100, // จำกัดการร้องขอ
};
