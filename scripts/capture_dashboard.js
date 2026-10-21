const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const outDir = path.resolve(__dirname, '../../brag-video/assets/screenshots');
fs.mkdirSync(outDir, { recursive: true });

const API_KEY = 'owa_k1_4c2f0f60c48635718f6828aef51e565e38182714f039a1f8f1fb789cb96f470e';

async function capture() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });

  console.log('Navigating to login...');
  await page.goto('http://127.0.0.1:2785/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((key) => {
    sessionStorage.setItem('openwa_api_key', key);
  }, API_KEY);

  const pages = [
    { name: 'dashboard_overview', url: 'http://127.0.0.1:2785/' },
    { name: 'sessions', url: 'http://127.0.0.1:2785/sessions' },
    { name: 'workflows', url: 'http://127.0.0.1:2785/workflows' },
    { name: 'integrations', url: 'http://127.0.0.1:2785/integrations' },
    { name: 'message_studio', url: 'http://127.0.0.1:2785/message-studio' },
  ];

  for (const p of pages) {
    try {
      console.log(`Navigating to ${p.name}: ${p.url}`);
      await page.goto(p.url, { waitUntil: 'networkidle0', timeout: 15000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 1500));
      const targetFile = path.join(outDir, `${p.name}.png`);
      await page.screenshot({ path: targetFile });
      console.log(`Saved screenshot: ${targetFile}`);
    } catch (err) {
      console.error(`Failed ${p.name}:`, err.message);
    }
  }

  await browser.close();
  console.log('All dashboard screenshots captured successfully.');
}

capture().catch(err => {
  console.error('Fatal error during capture:', err);
  process.exit(1);
});
