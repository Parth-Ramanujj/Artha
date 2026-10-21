const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const previewDir = path.resolve(__dirname, '../brag-video/previews');
fs.mkdirSync(previewDir, { recursive: true });

const testTimes = [
  { name: 'scene1_t2s', t: 2.0 },
  { name: 'scene2_t12s', t: 12.0 },
  { name: 'scene3_t20s', t: 20.0 },
  { name: 'scene4_t30s', t: 30.0 },
  { name: 'scene5_t38s', t: 38.0 },
  { name: 'scene6_t46s', t: 46.0 },
  { name: 'scene7_t55s', t: 55.0 }
];

async function testPreviews() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:9099/render/template.html', { waitUntil: 'networkidle0' });

  for (const item of testTimes) {
    await page.evaluate((currT) => window.renderTime(currT), item.t);
    const file = path.join(previewDir, `${item.name}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 90 });
    console.log(`Saved preview: ${item.name}.jpg at t=${item.t}s`);
  }

  await browser.close();
  console.log('All 7 scene previews generated successfully!');
}

testPreviews().catch(console.error);
