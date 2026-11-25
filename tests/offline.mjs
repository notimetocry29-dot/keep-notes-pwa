// اختبار الأوفلاين والتحديث: تثبيت Service Worker → قطع النت → إعادة تحميل → تحديث BUILD مرة واحدة
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, normalize, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg'
};

const srv = { down: false, swBuild: null };
const server = createServer(async (req, res) => {
  if (srv.down) { req.socket.destroy(); return; }
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = normalize(join(ROOT, p));
    if (!f.startsWith(ROOT + sep) || f.includes(sep + '.git' + sep)) { res.writeHead(403).end(); return; }
    let body = await readFile(f);
    if (p === '/sw.js' && srv.swBuild) {
      body = Buffer.from(body.toString('utf8').replace(/const BUILD\s*=\s*['"]\d+['"]/, `const BUILD = '${srv.swBuild}'`));
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL0 = `http://localhost:${server.address().port}/`;

let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const br = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] } : {}
);

try {
  const ctx = await br.newContext({ viewport: { width: 393, height: 800 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('kl_seen', String(Date.now())); } catch {}
  });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', (e) => errs.push(e.message));

  await pg.goto(URL0);
  await pg.waitForFunction(
    () => navigator.serviceWorker && navigator.serviceWorker.controller && navigator.serviceWorker.controller.state === 'activated',
    null,
    { timeout: 20000 }
  );
  const build0 = await pg.evaluate(() => window.VER);
  ok(await pg.evaluate(() => document.querySelector('#updBtn').hidden), 'no update button on first install');

  // Offline reload
  srv.down = true;
  await ctx.setOffline(true);
  await pg.reload();
  await pg.waitForTimeout(900);
  ok(await pg.evaluate(() => !!document.querySelector('#view') && document.querySelector('#view').textContent.trim().length > 0), 'app renders offline from SW cache');

  // Online + bumped sw.js
  srv.down = false;
  await ctx.setOffline(false);
  srv.swBuild = String(Number(build0) + 1);
  await pg.reload();
  await pg.waitForFunction(() => !document.querySelector('#updBtn').hidden, null, { timeout: 15000 });
  ok(true, 'update button appears when new SW waits');

  await Promise.all([
    pg.waitForNavigation({ timeout: 15000 }),
    pg.click('#updBtn')
  ]);
  await pg.waitForTimeout(500);
  ok(await pg.evaluate(() => document.querySelector('#updBtn').hidden), 'update button hides after reload');
  ok(errs.length === 0, 'no page errors ' + errs.join(';'));
  await ctx.close();
} finally {
  await br.close();
  server.close();
}

console.log(fail ? `\n${fail} check(s) failed` : '\nall offline checks passed');
process.exit(fail ? 1 : 0);
