const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(process.env.MAOMI_DESKTOP_URL || "http://127.0.0.1:5173");
  await page.getByText("飞书").click();
  await page.getByText("可视化编辑").waitFor({ timeout: 15000 });
  await page.getByText("Diff").click();
  await page.getByText("纯文本编辑").click();
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
