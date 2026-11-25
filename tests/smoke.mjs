// اختبارات تلقائية لمنطق مفكرة KeepLite على عرض موبايل
import { chromium } from 'playwright';

const URL0 = process.env.APP_URL || 'http://localhost:8765/index.html';
let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };

const br = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] } : {}
);

async function openApp() {
  const ctx = await br.newContext({ viewport: { width: 393, height: 800 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('kl_seen', String(Date.now())); } catch {}
  });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', (e) => errs.push(e.message));
  pg.on('dialog', (d) => { errs.push('native dialog'); d.dismiss(); });
  await pg.goto(URL0);
  await pg.waitForTimeout(800);
  return { ctx, pg, errs };
}

// 1) Create, color, pin, search note
{
  const { ctx, pg, errs } = await openApp();
  await pg.click('#fabAddNote');
  await pg.fill('#noteTitleInput', 'قائمة السفر');
  await pg.fill('#noteContentInput', 'جواز السفر والشاحن');
  await pg.click('#editorColorPicker .swatch-btn[data-color="amber"]');
  await pg.click('#btnTogglePin');
  await pg.click('#btnSaveClose');
  await pg.waitForTimeout(400);

  ok(await pg.evaluate(() => !document.querySelector('#pinnedSection').hidden), 'pinned section visible after pinning');
  ok(await pg.evaluate(() => document.querySelectorAll('.note-card').length === 1), 'note card rendered');

  await pg.fill('#searchInput', 'غير موجود');
  await pg.waitForTimeout(150);
  ok(await pg.evaluate(() => document.querySelectorAll('.note-card').length === 0), 'search filters non-matching notes');
  await pg.click('#btnClearSearch');
  ok(await pg.evaluate(() => document.querySelectorAll('.note-card').length === 1), 'clear search restores note');
  ok(errs.length === 0, 'no errors (create/search) ' + errs.join(';'));
  await ctx.close();
}

// 2) Theme switching (Iron <-> Morning) + custom #ask & #undo
{
  const { ctx, pg, errs } = await openApp();
  await pg.click('#btnOpenBackup');
  await pg.waitForTimeout(200);
  await pg.click('#btnThemeMorning');
  ok(await pg.evaluate(() => document.documentElement.getAttribute('data-th') === 'morning'), 'switched to morning theme');
  await pg.click('#btnThemeIron');
  ok(await pg.evaluate(() => document.documentElement.getAttribute('data-th') === 'iron'), 'switched back to iron theme');
  await pg.click('#btnCloseBackup');

  // Create and delete with custom #ask + #undo
  await pg.click('#fabAddNote');
  await pg.fill('#noteTitleInput', 'مؤقتة');
  await pg.fill('#noteContentInput', 'سيتم حذفها');
  await pg.click('#btnDeleteNote');
  await pg.waitForTimeout(200);
  await pg.click('#askYes');
  await pg.waitForTimeout(300);
  ok(await pg.evaluate(() => document.querySelectorAll('.note-card').length === 0), 'note deleted after custom #ask confirm');
  await pg.click('#undoBtn');
  await pg.waitForTimeout(300);
  ok(await pg.evaluate(() => document.querySelectorAll('.note-card').length === 1), 'undo restores deleted note');
  ok(errs.length === 0, 'no errors (theme/delete/undo) ' + errs.join(';'));
  await ctx.close();
}

// 3) XSS-safe .txt restore + color sanitization
{
  const { ctx, pg, errs } = await openApp();
  const payload = [
    '--- NOTE [id: xss1 | color: javascript:alert(1) | pinned: true | updated: 2026-11-25T20:00:00.000Z] ---',
    'Title: <img src=x onerror=window.__xss=1>',
    '<script>window.__xss=2</script>نص آمن'
  ].join('\n');

  await pg.evaluate((txt) => window.applyRestoreFromTxt(txt, 'test.txt'), payload);
  await pg.waitForTimeout(300);
  ok(await pg.evaluate(() => !window.__xss), 'restore does not execute XSS');
  ok(await pg.evaluate(() => {
    const st = window.__klState();
    return st.notes.length === 1 && st.notes[0].color === 'default';
  }), 'invalid color sanitized to default');
  ok(errs.length === 0, 'no errors (restore) ' + errs.join(';'));
  await ctx.close();
}

await br.close();
console.log(fail ? `\n${fail} check(s) failed` : '\nall smoke checks passed');
process.exit(fail ? 1 : 0);
