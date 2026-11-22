const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 4567;
const LAN_IP = '10.180.235.44';
const APK_PATH = path.join(__dirname, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');

const getHtml = () => {
  const apkReady = fs.existsSync(APK_PATH);
  const apkSizeMb = apkReady ? (fs.statSync(APK_PATH).size / (1024 * 1024)).toFixed(1) : null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenWA / Artha — Install Mobile App</title>
  <style>
    body {
      background-color: #09090B;
      color: #FAFAFA;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 24px 16px;
      box-sizing: border-box;
      text-align: center;
    }
    .card {
      background-color: #18181B;
      border: 1px solid #27272A;
      border-radius: 24px;
      padding: 32px 24px;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 20px 48px rgba(0,0,0,0.85);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }
    .icon-box {
      width: 68px;
      height: 68px;
      border-radius: 18px;
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(16, 185, 129, 0.05));
      border: 1px solid rgba(16, 185, 129, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
    }
    h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.3px;
    }
    p {
      margin: 0;
      font-size: 13px;
      color: #A1A1AA;
      line-height: 1.5;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.35);
      color: #10B981;
      font-size: 11px;
      font-weight: 600;
      padding: 4px 12px;
      border-radius: 9999px;
    }
    .section-box {
      width: 100%;
      background: #121215;
      border: 1px solid #27272A;
      border-radius: 16px;
      padding: 16px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }
    .section-title {
      font-size: 13px;
      font-weight: 600;
      color: #FAFAFA;
    }
    .btn-primary {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background-color: #10B981;
      color: #022C22;
      text-decoration: none;
      font-weight: 700;
      font-size: 14px;
      padding: 13px 24px;
      border-radius: 9999px;
      width: 100%;
      box-sizing: border-box;
      box-shadow: 0 0 20px rgba(16, 185, 129, 0.4);
      transition: transform 0.1s ease;
    }
    .btn-secondary {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background-color: #27272A;
      color: #FAFAFA;
      text-decoration: none;
      font-weight: 600;
      font-size: 13px;
      padding: 12px 20px;
      border-radius: 9999px;
      width: 100%;
      box-sizing: border-box;
      border: 1px solid #3F3F46;
    }
    .qr-img {
      width: 160px;
      height: 160px;
      border-radius: 12px;
      background-color: #ffffff;
      padding: 8px;
      box-sizing: border-box;
    }
    .info {
      font-size: 11px;
      color: #71717A;
    }
    .divider {
      width: 100%;
      height: 1px;
      background-color: #27272A;
      margin: 4px 0;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-box">⚡</div>
    <h1>OpenWA / Artha</h1>
    <div class="badge">● Multi-Channel SaaS App</div>
    <p>WhatsApp Cloud API · Instagram · Facebook · Google Reviews</p>

    <!-- OPTION 1: INSTANT RUN IN EXPO GO -->
    <div class="section-box">
      <div class="section-title">🚀 Option 1: Instant Run (Android & iPhone)</div>
      <p style="font-size: 12px;">Scan with <b>Expo Go</b> or Phone Camera:</p>
      <img
        class="qr-img"
        src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=exp://${LAN_IP}:8081"
        alt="Expo Go QR Code"
      />
      <a href="exp://${LAN_IP}:8081" class="btn-secondary">
        📲 Open in Expo Go App
      </a>
    </div>

    <!-- OPTION 2: STANDALONE APK -->
    <div class="section-box">
      <div class="section-title">📦 Option 2: Direct Android APK Download</div>
      ${
        apkReady
          ? `<a href="/download/openwa-artha.apk" class="btn-primary">
              ⬇️ Download APK (${apkSizeMb} MB)
            </a>`
          : `<div style="color: #F59E0B; font-size: 12px; font-weight: 600;">
              ⏳ Compiling native APK in background...
            </div>
            <a href="/download/openwa-artha.apk" class="btn-primary" style="opacity: 0.6;">
              ⬇️ Download APK
            </a>`
      }
      <div class="info">Tap to download directly to your phone storage & tap Install.</div>
    </div>
  </div>
</body>
</html>`;
};

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getHtml());
    return;
  }

  if (req.url === '/download/openwa-artha.apk') {
    if (fs.existsSync(APK_PATH)) {
      const stat = fs.statSync(APK_PATH);
      res.writeHead(200, {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': 'attachment; filename="openwa-artha.apk"',
        'Content-Length': stat.size,
      });
      const stream = fs.createReadStream(APK_PATH);
      stream.pipe(res);
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<html><body style="background:#09090B;color:#fff;font-family:sans-serif;text-align:center;padding:50px;">
        <h2>⏳ APK is still finishing compilation...</h2>
        <p style="color:#A1A1AA;">Please refresh this page in 30-60 seconds to download the file.</p>
        <button onclick="location.reload()" style="background:#10B981;color:#022C22;padding:10px 20px;border-radius:20px;border:none;font-weight:bold;cursor:pointer;">Refresh Now</button>
      </body></html>`);
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Download Portal] Running on http://${LAN_IP}:${PORT}`);
});
