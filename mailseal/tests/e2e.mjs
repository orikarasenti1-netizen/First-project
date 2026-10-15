// End-to-end journey test with mocked DNS-over-HTTPS.
// Run: node mailseal/tests/e2e.mjs   (needs global playwright; serves the repo root on :8765)
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

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpeg': 'image/jpeg' };
const server = createServer(async (req, res) => {
  const path = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  try {
    const file = path.endsWith('/') ? join(path, 'index.html') : path;
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' }); res.end(body);
  } catch { res.writeHead(404); res.end('nf'); }
}).listen(8765);

const zone = {
  'MX acme-law.co.il': ['0 acme-law-co-il.mail.protection.outlook.com.'],
  'TXT acme-law.co.il': ['"MS=ms123"'],
  'MX secure.com': ['1 aspmx.l.google.com.'],
  'TXT secure.com': ['"v=spf1 include:_spf.google.com -all"'],
  'TXT _spf.google.com': ['"v=spf1 ip4:35.190.247.0/24 ~all"'],
  'TXT _dmarc.secure.com': ['"v=DMARC1; p=reject; rua=mailto:d@secure.com"'],
  'TXT google._domainkey.secure.com': ['"v=DKIM1; k=rsa; p=MIIBIjAN"']
};
const typeNum = { TXT: 16, MX: 15 };
let dnsDown = false;

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); console.log((cond ? 'PASS ' : 'FAIL ') + msg); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const ctx = await browser.newContext({ locale: 'en-US' });
await ctx.route(/cloudflare-dns\.com|dns\.google/, async (route) => {
  if (dnsDown) return route.abort();
  const u = new URL(route.request().url());
  const name = u.searchParams.get('name'), type = u.searchParams.get('type');
  const recs = zone[type + ' ' + name];
  const json = recs ? { Status: 0, Answer: recs.map(data => ({ name, type: typeNum[type], data })) } : { Status: 3 };
  await route.fulfill({ status: 200, contentType: 'application/dns-json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(json) });
});
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

// 1. Unprotected Microsoft 365 law firm
await page.goto('http://localhost:8765/mailseal/');
check(await page.locator('h1').innerText().then(t => t.includes('scammer')), 'English hero renders');
await page.fill('#domain', 'https://www.acme-law.co.il/contact');
check((await page.locator('#env-domain').innerText()) === 'acme-law.co.il', 'envelope mirrors typed domain');
await page.click('#scan-btn');
await page.waitForSelector('#results:not([hidden])');
check((await page.locator('#grade').innerText()) === 'F', 'grade F for unprotected domain');
check((await page.locator('#verdict-title').innerText()).includes('can be impersonated'), 'spoofable verdict');
check((await page.locator('#provider').innerText()) === 'Microsoft 365', 'provider detected');
const recs = await page.locator('.rec code').allInnerTexts();
check(recs.includes('v=spf1 include:spf.protection.outlook.com ~all'), 'exact SPF fix shown');
check(recs.includes('v=DMARC1; p=none; rua=mailto:dmarc-reports@acme-law.co.il; fo=1'), 'exact DMARC fix shown');
check(await page.locator('.fix h4', { hasText: 'Microsoft 365' }).count() === 1, 'M365 DKIM instructions shown');
check(page.url().includes('d=acme-law.co.il'), 'shareable URL updated');
check((await page.locator('#stamp-text').innerText()).toLowerCase() === 'forgeable', 'stamp says forgeable');

// 2. Order flow without contactEmail configured → copyable message
await page.click('#cta-order');
await page.fill('#order-form [name=name]', 'Dana Levi');
await page.fill('#order-form [name=email]', 'bad-email');
await page.click('#order-form button[type=submit]');
check(await page.locator('#order-error').isVisible(), 'order validation error on bad email');
await page.fill('#order-form [name=email]', 'dana@acme-law.co.il');
await page.click('#order-form button[type=submit]');
check(await page.locator('#order-done').isVisible(), 'order confirmation shown');
const msg = await page.locator('#order-message').innerText();
check(msg.includes('acme-law.co.il') && msg.includes('Grade: F'), 'order message includes scan summary');

// 3. Hebrew + RTL via toggle, results re-rendered
await page.click('#lang-toggle');
check((await page.getAttribute('html', 'dir')) === 'rtl', 'Hebrew switches to RTL');
check((await page.locator('#verdict-title').innerText()).includes('להתחזות'), 'verdict re-rendered in Hebrew');
check((await page.locator('#price-fix').innerText()).includes('₪350'), 'ILS founding price in Hebrew');

// 4. Deep link to protected domain
await page.goto('http://localhost:8765/mailseal/?d=secure.com&lang=en');
await page.waitForSelector('#results:not([hidden])');
check((await page.locator('#grade').innerText()) === 'A', 'deep link auto-scans; grade A');
check((await page.locator('#stamp-text').innerText()).toLowerCase() === 'sealed', 'stamp says sealed');

// 5. Failure cases: invalid domain and DNS outage
await page.fill('#domain', 'not a domain');
await page.click('#scan-btn');
check((await page.locator('#scan-error').innerText()).includes('doesn’t look like a domain'), 'invalid domain message');
dnsDown = true;
await page.fill('#domain', 'acme-law.co.il');
await page.click('#scan-btn');
await page.waitForSelector('#scan-error:not([hidden])', { timeout: 20000 });
check((await page.locator('#scan-error').innerText()).includes('couldn’t reach'), 'DNS outage message');
check(await page.locator('#scan-btn').isEnabled(), 'button re-enabled after failure');

// 6. Mobile width: no horizontal scroll
await page.setViewportSize({ width: 375, height: 800 });
dnsDown = false;
await page.goto('http://localhost:8765/mailseal/?d=acme-law.co.il&lang=he');
await page.waitForSelector('#results:not([hidden])');
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check(overflow <= 1, 'no horizontal scroll at 375px (overflow=' + overflow + ')');
if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + '/mobile-he.png' });

// 7. Prospect bulk tool
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto('http://localhost:8765/mailseal/prospects.html');
await page.fill('#domains', 'acme-law.co.il\nsecure.com\nnot a domain');
await page.click('#run');
await page.waitForFunction(() => document.querySelectorAll('#rows tr').length === 3, null, { timeout: 20000 });
const rows = await page.locator('#rows tr').allInnerTexts();
check(rows.some(r => r.includes('acme-law.co.il') && r.includes('F')), 'bulk: unprotected prospect graded F');
check(rows.some(r => r.includes('invalid')), 'bulk: invalid line reported');
await page.locator('#rows tr', { hasText: 'acme-law.co.il' }).locator('button').click();
check((await page.locator('#draft').inputValue()).includes('acme-law.co.il'), 'bulk: personalised draft generated');

check(errors.length === 0, 'no page errors (' + errors.join(' | ') + ')');
await browser.close();
server.close();
if (failures.length) { console.error('\n' + failures.length + ' failure(s)'); process.exit(1); }
console.log('\nAll e2e checks passed');
