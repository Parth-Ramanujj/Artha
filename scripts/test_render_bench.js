const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const path = require('path');

async function bench() {
  const t0 = Date.now();
  const htmlPath = 'file:///' + path.resolve(__dirname, '../brag-video/render/template.html').replace(/\\/g, '/');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto(htmlPath, { waitUntil: 'load' });

  console.log('Template loaded. Testing 30 frames JPEG stream...');
  const ffmpeg = spawn('ffmpeg', [
    '-y',
    '-f', 'image2pipe',
    '-vcodec', 'mjpeg',
    '-r', '30',
    '-i', '-',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'ultrafast',
    'd:/testing/OpenWA/data/test_bench.mp4'
  ]);

  for (let i = 0; i < 30; i++) {
    const t = i / 30.0;
    await page.evaluate((currT) => window.renderTime(currT), t);
    const buf = await page.screenshot({ type: 'jpeg', quality: 90 });
    ffmpeg.stdin.write(buf);
  }

  ffmpeg.stdin.end();
  await new Promise(r => ffmpeg.on('close', r));
  await browser.close();

  const elapsed = (Date.now() - t0) / 1000;
  console.log(`Rendered 30 frames (1 second of video) in ${elapsed.toFixed(2)}s!`);
}

bench().catch(console.error);
