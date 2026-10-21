const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../brag-video');

const server = http.createServer((req, res) => {
  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/render/template.html';
  const filePath = path.join(ROOT, reqPath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end('Not found: ' + reqPath);
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeMap = {
    '.html': 'text/html',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.webp': 'image/webp',
    '.js': 'application/javascript',
    '.css': 'text/css'
  };

  res.writeHead(200, { 'Content-Type': mimeMap[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(9099, '127.0.0.1', () => {
  console.log('Video render server listening at http://127.0.0.1:9099');
});
