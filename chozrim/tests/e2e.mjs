// Full journey on the Firebase emulators: owner signs up → designs card → customer joins on a phone →
// owner stamps by code → customer sees it live → reward redeemed → win-back list → trial expiry blocks stamping.
// Run: cd chozrim && npm run test:e2e
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(join(execSync('npm root -g').toString().trim(), 'playwright'))); }

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const fbDir = dirname(require.resolve('firebase/package.json'));
const PORT = 8770, PROJECT = 'demo-chozrim';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try {
    const file = join(root, p.endsWith('/') ? p + 'index.html' : p);
    if (!file.startsWith(root)) throw new Error('outside');
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(PORT);

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); console.log((cond ? 'PASS ' : 'FAIL ') + msg); };
const admin = async (path, fields, mask) => {
  const url = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/${path}` + (mask ? '?' + mask.map(m => 'updateMask.fieldPaths=' + m).join('&') : '');
  const r = await fetch(url, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'content-type': 'application/json' }, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error('admin write failed ' + r.status + ' ' + await r.text());
};
const daysAgo = n => new Date(Date.now() - n * 864e5).toISOString();

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
async function ctx(opts) {
  const c = await browser.newContext({ locale: 'he-IL', ...opts });
  await c.route(/www\.gstatic\.com\/firebasejs\/10\.14\.1\/(firebase-[a-z]+\.js)/, async r => {
    const name = r.request().url().split('/').pop();
    r.fulfill({ status: 200, contentType: 'text/javascript', body: await readFile(join(fbDir, name)) });
  });
  if (process.env.FONT_ROUTE) await (await import(process.env.FONT_ROUTE)).routeFonts(c);   // optional: real fonts for screenshots
  else await c.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));
  return c;
}
const errors = [];
const watch = (page, who) => page.on('pageerror', e => errors.push(who + ': ' + e.message));

const ownerCtx = await ctx({ viewport: { width: 1200, height: 900 } });
const owner = await ownerCtx.newPage(); watch(owner, 'owner');
const phoneCtx = await ctx({ viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true });
const phone = await phoneCtx.newPage(); watch(phone, 'customer');

// 1. Owner signs up
await owner.goto(`http://localhost:${PORT}/app.html`);
await owner.waitForSelector('#auth:not([hidden])');
await owner.fill('#auth-form [name=email]', 'noa@example.com');
await owner.fill('#auth-form [name=pw]', '123');
await owner.click('#auth-form button[data-mode=up]');
await owner.waitForSelector('#auth-err:not([hidden])');
check((await owner.textContent('#auth-err')).includes('קצרה'), 'weak password rejected with Hebrew message');
await owner.fill('#auth-form [name=pw]', 'secret123');
await owner.click('#auth-form button[data-mode=up]');

// 2. Designs the card
await owner.waitForSelector('#editor:not([hidden])');
await owner.click('#card-save');
check(await owner.isVisible('#card-err'), 'card form requires name and reward');
await owner.fill('#card-form [name=name]', 'קפה נועה');
await owner.fill('#card-form [name=reward]', 'קפה חינם');
await owner.selectOption('#card-form [name=goal]', '5');
await owner.click('#emojis button:nth-child(2)');
check((await owner.textContent('#card-preview .punch-name')) === 'קפה נועה', 'live preview updates while typing');
await owner.click('#card-save');
await owner.waitForSelector('#main:not([hidden])');
await owner.waitForSelector('[data-panel=poster]:not([hidden])');
check(await owner.locator('#poster svg').count() === 1, 'poster with QR shown right after creating the card');
const joinLink = await owner.inputValue('#join-link');
check(/c\.html\?b=[A-Za-z0-9]+$/.test(joinLink), 'join link generated: ' + joinLink);
const bizId = new URL(joinLink).searchParams.get('b');

// 3. Customer joins on a phone
await phone.goto(joinLink);
await phone.waitForSelector('#join:not([hidden])');
check((await phone.textContent('#join-preview .punch-name')) === 'קפה נועה', 'customer sees the business card before joining');
await phone.fill('#join-form [name=name]', 'דנה כהן');
await phone.check('#join-form [name=consent]');
await phone.click('#join-btn');
check((await phone.textContent('#join-err')).includes('טלפון'), 'WhatsApp consent requires a phone number');
await phone.fill('#join-form [name=phone]', '050-1234567');
await phone.click('#join-btn');
await phone.waitForSelector('#mycard:not([hidden])');
const code = (await phone.textContent('#code')).trim();
check(/^\d{4}$/.test(code), 'customer receives a 4-digit code: ' + code);
check(phone.url().includes('&m='), 'card URL holds the member link');
check(await phone.locator('.hole.on').count() === 0, 'new card starts empty');

// 4. Owner stamps by code, customer sees it live
await owner.click('.tabs button[data-tab=register]');
for (const d of '0000') await owner.click(`#keypad button[aria-label="${d}"]`);
await owner.waitForSelector('#found .notice');
check((await owner.textContent('#found')).includes('לא נמצא'), 'unknown code shows not-found');
await owner.click('#keypad button[aria-label="ניקוי"]');
for (const d of code) await owner.click(`#keypad button[aria-label="${d}"]`);
await owner.waitForSelector('#found h3');
check((await owner.textContent('#found h3')) === 'דנה כהן', 'owner finds the customer by code');
await owner.click('#stamp1');
await phone.waitForFunction(() => document.querySelectorAll('.hole.on').length === 1, null, { timeout: 10000 });
check(true, 'customer card updates live after a stamp (no refresh)');
await owner.click('#found .btn.ghost >> text=+2');
await owner.waitForFunction(() => document.querySelector('#found') && document.querySelector('#found').textContent.includes('3 מתוך 5'));
await owner.click('#found .btn.ghost >> text=+2');
await owner.waitForSelector('#redeem');
await phone.waitForSelector('#ready:not([hidden])', { timeout: 10000 });
check((await phone.textContent('#ready')).includes('קפה חינם'), 'customer sees reward-ready banner');
await owner.click('#redeem');
await phone.waitForFunction(() => document.querySelectorAll('.hole.on').length === 0, null, { timeout: 10000 });
check(await phone.isHidden('#ready'), 'after redemption the card resets');
check((await phone.textContent('#stats-line')).includes('הטבה אחת'), 'customer sees rewards count');

// 5. Returning to the card later from the same phone works without the link
await phone.goto(`http://localhost:${PORT}/c.html?b=${bizId}`);
await phone.waitForSelector('#mycard:not([hidden])');
check((await phone.textContent('#code')).trim() === code, 'card remembered on the device');

// 6. Customers tab: lapsed customer gets a WhatsApp win-back message
await admin(`businesses/${bizId}/members/lapsedmember000000001`, {
  name: { stringValue: 'יוסי לוי' }, phone: { stringValue: '0527654321' }, consent: { booleanValue: true }, code: { stringValue: '4242' },
  stamps: { integerValue: '3' }, totalStamps: { integerValue: '3' }, rewards: { integerValue: '0' },
  joinedAt: { timestampValue: daysAgo(60) }, lastVisit: { timestampValue: daysAgo(30) }
});
await admin(`businesses/${bizId}/members/noconsent00000000001`, {
  name: { stringValue: 'רוני' }, phone: { stringValue: '0541112222' }, consent: { booleanValue: false }, code: { stringValue: '1313' },
  stamps: { integerValue: '1' }, totalStamps: { integerValue: '1' }, rewards: { integerValue: '0' },
  joinedAt: { timestampValue: daysAgo(50) }, lastVisit: { timestampValue: daysAgo(25) }
});
await owner.click('.tabs button[data-tab=customers]');
await owner.waitForSelector('.person');
const statText = await owner.textContent('#stats');
check(statText.includes('3') && statText.includes('חברים'), 'stats count members');
await owner.click('#filters button:nth-child(2)');
await owner.waitForSelector('.person .nm');
const names = await owner.locator('.person .nm').allTextContents();
check(names.includes('יוסי לוי') && names.includes('רוני') && !names.includes('דנה כהן'), 'lapsed filter shows only lapsed customers');
const wa = await owner.locator('.person', { hasText: 'יוסי לוי' }).locator('a.wa').getAttribute('href');
check(wa.startsWith('https://wa.me/972527654321') && decodeURIComponent(wa).includes('עוד 2'), 'win-back WhatsApp link is personalised: ' + decodeURIComponent(wa).slice(0, 80));
check(await owner.locator('.person', { hasText: 'רוני' }).locator('a.wa').count() === 0, 'no WhatsApp button without consent');

// 7. Search by name at the register
await owner.click('.tabs button[data-tab=register]');
await owner.fill('#search', 'יוסי');
await owner.click('#search-results .person');
check((await owner.textContent('#found h3')) === 'יוסי לוי', 'search by name finds the customer');

// 8. Trial expired: stamping blocked, existing cards still visible, joining closed
await admin(`businesses/${bizId}`, { createdAt: { timestampValue: daysAgo(40) } }, ['createdAt']);
await owner.reload();
await owner.waitForSelector('#main:not([hidden])');
check(await owner.isVisible('#register-blocked'), 'owner sees stamping is paused after trial');
await phone.reload();
await phone.waitForSelector('#mycard:not([hidden])');
check(true, 'customer still sees their card after trial ends');
const stranger = await (await ctx({ viewport: { width: 375, height: 760 } })).newPage(); watch(stranger, 'stranger');
await stranger.goto(joinLink);
await stranger.waitForSelector('#msg:not([hidden])');
check((await stranger.textContent('#msg')).includes('סגורה'), 'new joins closed while unpaid');
await admin(`businesses/${bizId}`, { paidUntil: { timestampValue: new Date(Date.now() + 30 * 864e5).toISOString() } }, ['paidUntil']);
await owner.reload();
await owner.waitForSelector('#main:not([hidden])');
check(await owner.isVisible('#register-ok'), 'marking as paid re-enables stamping');

// 9. Bad links
await stranger.goto(`http://localhost:${PORT}/c.html?b=doesnotexist`);
await stranger.waitForSelector('#msg:not([hidden])');
check((await stranger.textContent('#msg')).includes('לא נמצאה'), 'unknown business link handled');

// 10. Layout: no horizontal scroll on phones
for (const [p, label] of [[phone, 'card'], [owner, 'app']]) {
  await p.setViewportSize({ width: 375, height: 760 });
  const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(over <= 1, `no horizontal scroll on ${label} at 375px (overflow=${over})`);
}
if (process.env.SHOT_DIR) {
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.screenshot({ path: process.env.SHOT_DIR + '/card.png' });
  await owner.setViewportSize({ width: 1100, height: 900 });
  await owner.click('.tabs button[data-tab=register]');
  for (const d of code) await owner.click(`#keypad button[aria-label="${d}"]`);
  await owner.waitForSelector('#found h3');
  await owner.screenshot({ path: process.env.SHOT_DIR + '/register.png' });
  await owner.click('.tabs button[data-tab=poster]'); await owner.waitForSelector('#poster svg');
  await owner.screenshot({ path: process.env.SHOT_DIR + '/poster.png' });
  await owner.click('.tabs button[data-tab=customers]'); await owner.waitForSelector('.person');
  await owner.screenshot({ path: process.env.SHOT_DIR + '/customers.png', fullPage: true });
}

check(errors.length === 0, 'no page errors ' + errors.join(' | '));
await browser.close();
server.close();
if (failures.length) { console.error(`\n${failures.length} failure(s)`); process.exit(1); }
console.log('\nAll e2e checks passed');
