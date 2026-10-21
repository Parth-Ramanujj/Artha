const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.resolve(__dirname, '../brag-video');
const AUDIO_PATH = path.join(OUT_DIR, 'audio', 'master_audio.wav');
const FINAL_VIDEO = path.join(OUT_DIR, 'brag_video_60s.mp4');
const POSTER_IMAGE = path.join(OUT_DIR, 'brag_poster.jpg');

const FPS = 30;
const DURATION = 60.0; // 60 seconds exactly
const TOTAL_FRAMES = Math.round(FPS * DURATION); // 1800 frames

async function render() {
  console.log(`Starting 60-Second Video Render (${TOTAL_FRAMES} frames @ ${FPS}fps)...`);
  const t0 = Date.now();

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1920,1080',
      '--disable-dev-shm-usage',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding'
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  
  console.log('Loading template from local server...');
  await page.goto('http://127.0.0.1:9099/render/template.html', { waitUntil: 'networkidle0' });

  // Capture Poster Frame (at t=12.0s, the hero Artha platform reveal)
  console.log('Extracting hero poster frame at t=12.0s...');
  await page.evaluate(() => window.renderTime(12.0));
  await page.screenshot({ path: POSTER_IMAGE, type: 'jpeg', quality: 95 });
  console.log(`Poster frame saved to: ${POSTER_IMAGE}`);

  console.log('Spawning FFmpeg pipeline...');
  const ffmpeg = spawn('ffmpeg', [
    '-y',
    '-f', 'image2pipe',
    '-vcodec', 'mjpeg',
    '-r', String(FPS),
    '-i', '-',
    '-i', AUDIO_PATH,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '19',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '320k',
    '-t', '60.0',
    FINAL_VIDEO
  ]);

  ffmpeg.stderr.on('data', (d) => {
    // Suppress verbose ffmpeg output, only show errors
    const str = d.toString();
    if (str.includes('Error') || str.includes('fatal')) {
      console.error('[FFmpeg Error]', str);
    }
  });

  console.log('Streaming frames to FFmpeg...');
  let lastLog = Date.now();

  for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
    const t = frame / FPS;
    await page.evaluate((currT) => window.renderTime(currT), t);
    const buf = await page.screenshot({ type: 'jpeg', quality: 90 });
    
    const canContinue = ffmpeg.stdin.write(buf);
    if (!canContinue) {
      await new Promise(r => ffmpeg.stdin.once('drain', r));
    }

    if (frame % 150 === 0 || frame === TOTAL_FRAMES - 1) {
      const pct = ((frame / TOTAL_FRAMES) * 100).toFixed(1);
      const fpsReal = (frame / ((Date.now() - t0) / 1000)).toFixed(1);
      console.log(`[Render Progress] Frame ${frame}/${TOTAL_FRAMES} (${pct}%) @ ${fpsReal} fps | Time: ${t.toFixed(1)}s`);
    }
  }

  console.log('Finishing stream...');
  ffmpeg.stdin.end();

  await new Promise((resolve, reject) => {
    ffmpeg.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}`));
    });
  });

  await browser.close();

  const totalTime = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n🎉 60-Second Video Render COMPLETE in ${totalTime}s!`);
  console.log(`Output: ${FINAL_VIDEO}`);
}

render().catch((err) => {
  console.error('Fatal render failure:', err);
  process.exit(1);
});
