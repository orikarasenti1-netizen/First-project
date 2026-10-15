// Run: node --test mailseal/tests/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const MailSeal = require('../checker.js');

// Mock DNS: zone maps "TYPE name" -> array of records. Missing keys behave like NXDOMAIN/NODATA.
function mockDns(zone, failNames = []) {
  return {
    async txt(name) {
      if (failNames.includes(name)) throw new Error('SERVFAIL');
      return zone['TXT ' + name] || [];
    },
    async mx(name) {
      if (failNames.includes(name)) throw new Error('SERVFAIL');
      return zone['MX ' + name] || [];
    },
    async ns(name) {
      if (failNames.includes(name)) throw new Error('SERVFAIL');
      return zone['NS ' + name] || [];
    }
  };
}

const googleMx = [{ priority: 1, host: 'aspmx.l.google.com' }, { priority: 5, host: 'alt1.aspmx.l.google.com' }];
const msMx = [{ priority: 0, host: 'contoso-co-il.mail.protection.outlook.com' }];
const providerSpf = {
  'TXT _spf.google.com': ['v=spf1 include:_netblocks.google.com include:_netblocks2.google.com include:_netblocks3.google.com ~all'],
  'TXT _netblocks.google.com': ['v=spf1 ip4:35.190.247.0/24 ~all'],
  'TXT _netblocks2.google.com': ['v=spf1 ip6:2001:4860:4000::/36 ~all'],
  'TXT _netblocks3.google.com': ['v=spf1 ip4:172.217.32.0/20 ~all'],
  'TXT spf.protection.outlook.com': ['v=spf1 ip4:40.92.0.0/15 -all']
};

test('normalizeDomain handles URLs, emails, www and junk', () => {
  assert.equal(MailSeal.normalizeDomain('https://www.Example.co.il/about?x=1'), 'example.co.il');
  assert.equal(MailSeal.normalizeDomain('dana@lawfirm.com'), 'lawfirm.com');
  assert.equal(MailSeal.normalizeDomain('  shop.example.com.  '), 'shop.example.com');
  assert.equal(MailSeal.normalizeDomain('localhost'), null);
  assert.equal(MailSeal.normalizeDomain(''), null);
  assert.equal(MailSeal.normalizeDomain('not a domain'), null);
  assert.equal(MailSeal.normalizeDomain('ex ample.com'), null);
});

test('orgDomain respects multi-label suffixes', () => {
  assert.equal(MailSeal.orgDomain('mail.firm.co.il'), 'firm.co.il');
  assert.equal(MailSeal.orgDomain('firm.co.il'), 'firm.co.il');
  assert.equal(MailSeal.orgDomain('news.example.com'), 'example.com');
});

test('fully protected Google Workspace domain scores A and is not spoofable', async () => {
  const dns = mockDns({
    ...providerSpf,
    'MX good.com': googleMx,
    'TXT good.com': ['google-site-verification=abc', 'v=spf1 include:_spf.google.com ~all'],
    'TXT _dmarc.good.com': ['v=DMARC1; p=reject; rua=mailto:d@good.com'],
    'TXT google._domainkey.good.com': ['v=DKIM1; k=rsa; p=MIIBIjANBgkq'],
    'TXT _mta-sts.good.com': ['v=STSv1; id=1'],
    'TXT _smtp._tls.good.com': ['v=TLSRPTv1; rua=mailto:t@good.com']
  });
  const r = await MailSeal.scan('good.com', dns);
  assert.equal(r.provider.id, 'google');
  assert.equal(r.spf.lookups, 4);
  assert.equal(r.score, 100);
  assert.equal(r.grade, 'A');
  assert.equal(r.spoofable, false);
  assert.deepEqual(r.dkim.selectors, ['google']);
  assert.equal(r.fixes.length, 0);
  assert.ok(r.findings.every(f => f.severity === 'ok'));
});

test('Microsoft 365 domain with nothing configured gets F and an exact fix plan', async () => {
  const dns = mockDns({ ...providerSpf, 'MX contoso.co.il': msMx });
  const r = await MailSeal.scan('contoso.co.il', dns);
  assert.equal(r.provider.id, 'microsoft');
  assert.equal(r.grade, 'F');
  assert.equal(r.spoofable, true);
  const codes = r.findings.map(f => f.code);
  assert.ok(codes.includes('spf_missing') && codes.includes('dmarc_missing') && codes.includes('dkim_not_found'));
  const spfFix = r.fixes.find(x => x.code === 'fix_spf_new');
  assert.equal(spfFix.value, 'v=spf1 include:spf.protection.outlook.com ~all');
  const dmarcFix = r.fixes.find(x => x.code === 'fix_dmarc_new');
  assert.equal(dmarcFix.value, 'v=DMARC1; p=none; rua=mailto:dmarc-reports@contoso.co.il; fo=1');
  assert.equal(dmarcFix.fqdn, '_dmarc.contoso.co.il');
  assert.ok(r.fixes.some(x => x.code === 'fix_dkim_microsoft'));
});

test('p=none is flagged as spoofable and a staged quarantine record is proposed', async () => {
  const dns = mockDns({
    ...providerSpf,
    'MX mid.com': googleMx,
    'TXT mid.com': ['v=spf1 include:_spf.google.com ~all'],
    'TXT _dmarc.mid.com': ['v=DMARC1; p=none; rua=mailto:r@mid.com'],
    'TXT google._domainkey.mid.com': ['v=DKIM1; p=MIIB']
  });
  const r = await MailSeal.scan('mid.com', dns);
  assert.equal(r.spoofable, true);
  assert.equal(r.score, 75);
  assert.equal(r.grade, 'B');
  const fix = r.fixes.find(x => x.code === 'fix_dmarc_quarantine');
  assert.equal(fix.value, 'v=DMARC1; p=quarantine; pct=100; rua=mailto:r@mid.com; fo=1');
});

test('multiple SPF records are merged into one with the provider include', async () => {
  const dns = mockDns({
    ...providerSpf,
    'MX dup.com': googleMx,
    'TXT dup.com': ['v=spf1 include:servers.mcsv.net ~all', 'v=spf1 ip4:1.2.3.4 -all']
  });
  const r = await MailSeal.scan('dup.com', dns);
  assert.ok(r.findings.some(f => f.code === 'spf_multiple'));
  assert.equal(r.fixes.find(x => x.code === 'fix_spf_merge').value, 'v=spf1 include:_spf.google.com include:servers.mcsv.net ip4:1.2.3.4 ~all');
});

test('SPF missing the provider include and using +all is rebuilt', async () => {
  const dns = mockDns({
    ...providerSpf,
    'MX bad.com': msMx,
    'TXT bad.com': ['v=spf1 a mx +all']
  });
  const r = await MailSeal.scan('bad.com', dns);
  const codes = r.findings.map(f => f.code);
  assert.ok(codes.includes('spf_plus_all'));
  assert.ok(codes.includes('spf_missing_provider'));
  assert.equal(r.fixes.find(x => x.code === 'fix_spf_update').value, 'v=spf1 include:spf.protection.outlook.com a mx ~all');
});

test('SPF over 10 DNS lookups is critical; broken include detected; loops do not hang', async () => {
  const zone = { ...providerSpf, 'MX heavy.com': googleMx };
  const inc = [];
  for (let i = 0; i < 9; i++) { inc.push(`include:s${i}.vendor.com`); zone[`TXT s${i}.vendor.com`] = ['v=spf1 a ~all']; }
  zone['TXT s8.vendor.com'] = ['v=spf1 include:heavy.com ~all']; // loop back to self
  zone['TXT heavy.com'] = ['v=spf1 include:_spf.google.com ' + inc.join(' ') + ' include:gone.example ~all'];
  const r = await MailSeal.scan('heavy.com', mockDns(zone));
  assert.ok(r.spf.lookups > 10, 'lookups=' + r.spf.lookups);
  assert.ok(r.findings.some(f => f.code === 'spf_too_many_lookups'));
  assert.ok(r.findings.some(f => f.code === 'spf_broken_include' && f.params.list.includes('gone.example')));
});

test('parked domain without MX: lockdown records recommended', async () => {
  const r = await MailSeal.scan('parked.com', mockDns({}));
  assert.equal(r.receivesMail, false);
  assert.equal(r.grade, 'F');
  assert.deepEqual(r.fixes.map(x => x.value), ['v=spf1 -all', 'v=DMARC1; p=reject; adkim=s; aspf=s']);
  const locked = await MailSeal.scan('locked.com', mockDns({
    'MX locked.com': [{ priority: 0, host: '.' }],
    'TXT locked.com': ['v=spf1 -all'],
    'TXT _dmarc.locked.com': ['v=DMARC1; p=reject;']
  }));
  assert.equal(locked.grade, 'A');
  assert.equal(locked.spoofable, false);
});

test('subdomain inherits organisational DMARC (sp= takes precedence)', async () => {
  const dns = mockDns({
    ...providerSpf,
    'MX mail.firm.co.il': googleMx,
    'TXT mail.firm.co.il': ['v=spf1 include:_spf.google.com -all'],
    'TXT _dmarc.firm.co.il': ['v=DMARC1; p=reject; sp=none; rua=mailto:x@firm.co.il'],
    'TXT google._domainkey.mail.firm.co.il': ['p=MIIB']
  });
  const r = await MailSeal.scan('mail.firm.co.il', dns);
  assert.equal(r.dmarc.inherited, true);
  assert.equal(r.dmarc.policy, 'none');
  assert.equal(r.spoofable, true);
  assert.equal(r.fixes.find(x => x.code === 'fix_dmarc_quarantine').fqdn, '_dmarc.firm.co.il');
});

test('revoked DKIM key does not count; custom selector option is probed', async () => {
  const dns = mockDns({
    ...providerSpf,
    'MX k.com': googleMx,
    'TXT k.com': ['v=spf1 include:_spf.google.com ~all'],
    'TXT google._domainkey.k.com': ['v=DKIM1; p='],
    'TXT acme2024._domainkey.k.com': ['v=DKIM1; p=MIIB']
  });
  const a = await MailSeal.scan('k.com', dns);
  assert.equal(a.dkim.status, 'not_found');
  const b = await MailSeal.scan('k.com', dns, { selectors: ['acme2024'] });
  assert.deepEqual(b.dkim.selectors, ['acme2024']);
});

test('DNS failure on the main domain rejects so the UI can show an error', async () => {
  await assert.rejects(MailSeal.scan('down.com', mockDns({}, ['down.com'])));
  await assert.rejects(MailSeal.scan('not a domain', mockDns({})), /invalid_domain/);
});

test('parseTxtData joins split quoted strings and decodes escapes', () => {
  assert.equal(MailSeal.parseTxtData('"v=spf1 include:a.com " "~all"'), 'v=spf1 include:a.com ~all');
  assert.equal(MailSeal.parseTxtData('v=spf1 -all'), 'v=spf1 -all');
  assert.equal(MailSeal.parseTxtData('"a\\"b\\059c"'), 'a"b;c');
});

test('DoH adapter falls back to second endpoint and maps NXDOMAIN to []', async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url);
    if (url.startsWith('https://cloudflare-dns.com')) return { ok: false, status: 503 };
    if (url.includes('name=missing.com')) return { ok: true, json: async () => ({ Status: 3 }) };
    if (url.includes('type=MX')) return { ok: true, json: async () => ({ Status: 0, Answer: [{ type: 15, data: '10 aspmx.l.google.com.' }, { type: 5, data: 'cname.' }] }) };
    return { ok: true, json: async () => ({ Status: 0, Answer: [{ type: 16, data: '"v=spf1 " "-all"' }] }) };
  };
  const dns = MailSeal.dohAdapter(fakeFetch);
  assert.deepEqual(await dns.mx('x.com'), [{ priority: 10, host: 'aspmx.l.google.com' }]);
  assert.deepEqual(await dns.txt('x.com'), ['v=spf1 -all']);
  assert.deepEqual(await dns.txt('missing.com'), []);
  assert.ok(calls.some(u => u.startsWith('https://dns.google/resolve')));
  const dead = MailSeal.dohAdapter(async () => { throw new Error('offline'); });
  await assert.rejects(dead.txt('x.com'), /dns_unavailable/);
});

test('lookalike candidates: convincing variants first, no original, no stripped names', () => {
  const c = MailSeal.lookalikeCandidates('https://www.cohen-law.co.il/');
  const names = c.map(x => x.domain);
  assert.ok(names.includes('cohen-iaw.co.il'), 'l->i homoglyph');
  assert.ok(names.includes('cohen-law.com'), 'TLD swap');
  assert.ok(names.includes('cohenlaw.co.il'), 'hyphen removed');
  assert.ok(!names.includes('cohen-law.co.il'), 'original excluded');
  assert.ok(!names.includes('cohen.co.il'), 'stripping the legal word would flag unrelated owners');
  assert.equal(c[0].technique, 'homoglyph');
  assert.equal(new Set(names).size, names.length, 'no duplicates');
  assert.ok(names.every(n => /^[a-z0-9-]+\.[a-z.]+$/.test(n)));
  const bare = MailSeal.lookalikeCandidates('levi.co.il').map(x => x.domain);
  assert.ok(bare.includes('levi-law.co.il') && bare.includes('leviadv.com'), 'legal words appended to bare names');
});

test('findLookalikes reports registered variants, mail-capable first, tolerates lookup errors', async () => {
  const dns = mockDns({
    'NS cohen-iaw.co.il': ['ns1.parking.example'],
    'MX cohen-iaw.co.il': [{ priority: 10, host: 'mx.evil.example' }],
    'NS cohen-law.com': ['ns1.registrar.example'],
    'NS cohenlaw.co.il': ['ns1.registrar.example'],
    'MX cohenlaw.co.il': [{ priority: 0, host: '.' }]
  }, ['c0hen-law.co.il']);
  let progressCalls = 0;
  const r = await MailSeal.findLookalikes('cohen-law.co.il', dns, { onProgress: () => progressCalls++ });
  assert.equal(r.checked, MailSeal.lookalikeCandidates('cohen-law.co.il').length);
  assert.deepEqual(r.found.map(f => f.domain), ['cohen-iaw.co.il', 'cohen-law.com', 'cohenlaw.co.il']);
  assert.equal(r.found[0].mail, true);
  assert.equal(r.found[2].mail, false, 'null MX is not mail-capable');
  assert.equal(r.errors, 1);
  assert.equal(progressCalls, r.checked);
});
