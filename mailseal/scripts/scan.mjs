#!/usr/bin/env node
// MailSeal CLI scanner (Node 18+). Uses the same engine as the web page.
//
//   node mailseal/scripts/scan.mjs example.com other.co.il      # scan domains, print table
//   node mailseal/scripts/scan.mjs --doh example.com             # use DNS-over-HTTPS (same path as the browser)
//   node mailseal/scripts/scan.mjs --json example.com            # machine-readable output
//   MAILSEAL_CUSTOMERS="a.com:A,b.co.il:B" node mailseal/scripts/scan.mjs --monitor
//
// --monitor reads "domain[:minGrade]" pairs from $MAILSEAL_CUSTOMERS (a GitHub Actions *variable*, so
// customer names never live in this public repo), masks domains in CI logs, writes a summary, and exits 1
// when any customer is spoofable or below their minimum grade — GitHub then emails the repo owner.
import { promises as dnsp } from 'node:dns';
import { appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const MailSeal = require('../checker.js');

const NODATA = new Set(['ENODATA', 'ENOTFOUND', 'NXDOMAIN', 'ENONAME']);
const nodeAdapter = {
  async txt(name) {
    try { return (await dnsp.resolveTxt(name)).map(chunks => chunks.join('')); }
    catch (e) { if (NODATA.has(e.code)) return []; throw e; }
  },
  async mx(name) {
    try { return (await dnsp.resolveMx(name)).map(m => ({ priority: m.priority, host: m.exchange || '.' })); }
    catch (e) { if (NODATA.has(e.code)) return []; throw e; }
  }
};

const args = process.argv.slice(2);
const flag = f => { const i = args.indexOf(f); if (i !== -1) { args.splice(i, 1); return true; } return false; };
const useDoh = flag('--doh'), asJson = flag('--json'), monitor = flag('--monitor');
const dns = useDoh ? MailSeal.dohAdapter(fetch) : nodeAdapter;
const inCI = !!process.env.GITHUB_ACTIONS;
const GRADES = ['F', 'D', 'C', 'B', 'A'];

function line(r) {
  const dmarc = r.dmarc.status === 'present' ? 'p=' + r.dmarc.policy : r.dmarc.status;
  const spf = r.spf.status + (r.spf.all ? '(' + r.spf.all + 'all, ' + r.spf.lookups + ' lookups)' : '');
  return [r.grade, String(r.score).padStart(3), r.spoofable ? 'SPOOFABLE' : 'protected', (r.provider ? r.provider.name : r.receivesMail ? 'other' : 'no-MX'), 'spf=' + spf, 'dmarc=' + dmarc, 'dkim=' + r.dkim.status + (r.dkim.selectors.length ? '(' + r.dkim.selectors.join('/') + ')' : '')].join('  ');
}

async function scanAll(domains) {
  const out = [];
  for (const d of domains) {
    try { out.push({ domain: d, r: await MailSeal.scan(d, dns) }); }
    catch (e) { out.push({ domain: d, error: e.code || e.message }); }
  }
  return out;
}

if (monitor) {
  const spec = (process.env.MAILSEAL_CUSTOMERS || '').split(/[,\n]/).map(s => s.trim()).filter(Boolean);
  if (!spec.length) { console.log('No customers configured (set repository variable MAILSEAL_CUSTOMERS). Nothing to do.'); process.exit(0); }
  const customers = spec.map((s, i) => { const [domain, min] = s.split(':'); return { n: i + 1, domain: domain.trim(), min: (min || 'A').trim().toUpperCase() }; });
  if (inCI) customers.forEach(c => console.log('::add-mask::' + c.domain));
  const problems = [];
  const rows = [];
  for (const c of customers) {
    let r;
    try { r = await MailSeal.scan(c.domain, dns); }
    catch (e) { problems.push(`Customer #${c.n}: scan failed (${e.code || e.message})`); rows.push(`| #${c.n} | — | — | scan failed |`); continue; }
    const issues = r.findings.filter(f => f.severity === 'critical' || f.severity === 'high').map(f => f.code);
    const bad = r.spoofable || GRADES.indexOf(r.grade) < GRADES.indexOf(c.min);
    if (bad) problems.push(`Customer #${c.n}: grade ${r.grade} (min ${c.min})${r.spoofable ? ', spoofable' : ''} — ${issues.join(', ') || 'see scan'}`);
    rows.push(`| #${c.n} | ${r.grade} (${r.score}) | ${r.spoofable ? 'yes' : 'no'} | ${issues.join(', ') || 'ok'} |`);
  }
  const summary = ['## MailSeal weekly monitor', '', `Checked ${customers.length} customer domain(s) on ${new Date().toISOString().slice(0, 10)}.`, '',
    '| Customer | Grade | Spoofable | High/critical findings |', '|---|---|---|---|', ...rows, '',
    problems.length ? '**Action needed:** ' + problems.length + ' customer(s) regressed. Customer numbers follow the order in MAILSEAL_CUSTOMERS. Open the MailSeal page with `?d=<domain>` to see the exact fix.' : 'All customers protected. Nothing to do.'].join('\n');
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
  process.exit(problems.length ? 1 : 0);
}

if (!args.length) { console.error('usage: scan.mjs [--doh] [--json] domain [domain...] | --monitor'); process.exit(2); }
const results = await scanAll(args);
if (asJson) console.log(JSON.stringify(results, null, 2));
else for (const x of results) console.log(x.domain.padEnd(28) + (x.error ? 'ERROR ' + x.error : line(x.r)));
process.exit(results.some(x => x.error) ? 1 : 0);
