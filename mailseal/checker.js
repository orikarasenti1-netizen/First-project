/*
 * MailSeal checker — email authentication analysis (SPF, DKIM, DMARC, MTA-STS, TLS-RPT).
 *
 * Pure analysis over a pluggable DNS adapter so the same code runs:
 *   - in the browser (DNS-over-HTTPS adapter, see dohAdapter below)
 *   - in Node / GitHub Actions (node:dns adapter, see scripts/mailseal-scan.mjs)
 *
 * Adapter interface:
 *   txt(name) -> Promise<string[]>                 (each TXT record, chunks joined; [] if none)
 *   mx(name)  -> Promise<{priority:number, host:string}[]>  ([] if none)
 *   ns(name)  -> Promise<string[]>                 (only needed for findLookalikes)
 * Adapters must resolve [] for NXDOMAIN / NODATA and reject only on real lookup failures.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MailSeal = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Mail providers we can recognise from MX hosts, with the SPF include they require
  // and the DKIM selectors they use. Only providers whose values are well documented.
  var PROVIDERS = [
    { id: 'google', name: 'Google Workspace', mx: /(^|\.)(google|googlemail)\.com$/, spf: 'include:_spf.google.com', dkim: ['google'] },
    { id: 'microsoft', name: 'Microsoft 365', mx: /\.mail\.protection\.outlook\.com$/, spf: 'include:spf.protection.outlook.com', dkim: ['selector1', 'selector2'] },
    { id: 'zoho', name: 'Zoho Mail', mx: /(^|\.)zoho\.com$/, spf: 'include:zoho.com', dkim: ['zoho', 'zmail'] },
    { id: 'zoho-eu', name: 'Zoho Mail (EU)', mx: /(^|\.)zoho\.eu$/, spf: 'include:zoho.eu', dkim: ['zoho', 'zmail'] },
    { id: 'proton', name: 'Proton Mail', mx: /(^|\.)protonmail\.ch$/, spf: 'include:_spf.protonmail.ch', dkim: ['protonmail', 'protonmail2', 'protonmail3'] },
    { id: 'fastmail', name: 'Fastmail', mx: /(^|\.)messagingengine\.com$/, spf: 'include:spf.messagingengine.com', dkim: ['fm1', 'fm2', 'fm3'] },
    { id: 'privateemail', name: 'Namecheap Private Email', mx: /(^|\.)privateemail\.com$/, spf: 'include:spf.privateemail.com', dkim: ['default'] },
    { id: 'godaddy', name: 'GoDaddy Email', mx: /(^|\.)secureserver\.net$/, spf: 'include:secureserver.net', dkim: [] },
    { id: 'icloud', name: 'iCloud Mail', mx: /(^|\.)icloud\.com$/, spf: 'include:icloud.com', dkim: ['sig1'] },
    { id: 'ovh', name: 'OVHcloud Mail', mx: /(^|\.)ovh\.net$/, spf: 'include:mx.ovh.com', dkim: [] }
  ];

  // Selectors used by common senders (workspace suites, ESPs, CRMs). Probing these finds DKIM
  // for most small businesses; a custom selector can still exist, so "not found" is reported as such.
  var COMMON_SELECTORS = ['google', 'selector1', 'selector2', 'default', 'k1', 'k2', 's1', 's2', 'mail',
    'dkim', 'smtp', 'zoho', 'zmail', 'protonmail', 'fm1', 'sig1', 'mandrill', 'mailjet', 'hs1', 'hs2',
    'everlytickey1', 'cm', 'brevo', 'mxvault', 'resend'];

  var MULTI_LABEL_SUFFIXES = ['co.il', 'org.il', 'net.il', 'ac.il', 'gov.il', 'muni.il', 'k12.il',
    'co.uk', 'org.uk', 'ac.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'co.za', 'com.br', 'co.jp',
    'co.in', 'com.mx', 'com.tr', 'com.cy'];

  function normalizeDomain(input) {
    if (typeof input !== 'string') return null;
    var s = input.trim().toLowerCase();
    if (!s) return null;
    if (s.indexOf('@') !== -1) s = s.slice(s.lastIndexOf('@') + 1);
    s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
    s = s.split(/[\/?#:\s]/)[0];
    s = s.replace(/\.+$/, '');
    try { s = new URL('http://' + s).hostname; } catch (e) { return null; }
    s = s.replace(/^www\./, '');
    if (s.length > 253 || !/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/.test(s)) return null;
    return s;
  }

  function orgDomain(domain) {
    var labels = domain.split('.');
    if (labels.length <= 2) return domain;
    var last2 = labels.slice(-2).join('.');
    if (MULTI_LABEL_SUFFIXES.indexOf(last2) !== -1) return labels.slice(-3).join('.');
    return last2;
  }

  function detectProvider(mxRecords) {
    for (var i = 0; i < mxRecords.length; i++) {
      var host = mxRecords[i].host.toLowerCase().replace(/\.$/, '');
      for (var j = 0; j < PROVIDERS.length; j++) if (PROVIDERS[j].mx.test(host)) return PROVIDERS[j];
    }
    return null;
  }

  // ---------- SPF ----------
  function spfRecords(txts) { return txts.filter(function (t) { return /^v=spf1(\s|$)/i.test(t.trim()); }); }

  function parseSpfTerms(record) {
    return record.trim().split(/\s+/).slice(1).map(function (term) {
      var m = /^([+\-~?]?)([a-z0-9_.-]+)(?:[:=\/](.*))?$/i.exec(term) || [];
      var sep = term.charAt((m[1] || '').length + (m[2] || '').length);
      return { raw: term, qualifier: m[1] || '+', name: (m[2] || '').toLowerCase(), value: m[3] || '', isModifier: sep === '=' };
    });
  }

  // Counts DNS-querying mechanisms (RFC 7208 §4.6.4 limit: 10) across include/redirect chains.
  async function countSpfLookups(record, dns, state, depth) {
    var terms = parseSpfTerms(record);
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i];
      if (t.name === 'include' || (t.name === 'redirect' && t.isModifier)) {
        state.count++;
        var target = t.value.toLowerCase();
        if (state.visited[target] || depth >= 10 || state.count > 50) continue;
        state.visited[target] = true;
        var sub;
        try { sub = spfRecords(await dns.txt(target)); } catch (e) { state.errors.push(target); continue; }
        if (sub.length !== 1) { state.broken.push(target); continue; }
        await countSpfLookups(sub[0], dns, state, depth + 1);
      } else if (t.name === 'a' || t.name === 'mx' || t.name === 'exists' || t.name === 'ptr') {
        state.count++;
        if (t.name === 'ptr') state.ptr = true;
      }
    }
  }

  async function analyzeSpf(txts, dns, domain) {
    var recs = spfRecords(txts);
    if (!recs.length) return { status: 'missing' };
    if (recs.length > 1) return { status: 'multiple', records: recs };
    var record = recs[0];
    var terms = parseSpfTerms(record);
    var allTerm = terms.filter(function (t) { return t.name === 'all' && !t.isModifier; })[0];
    var hasRedirect = terms.some(function (t) { return t.name === 'redirect' && t.isModifier; });
    var state = { count: 0, visited: {}, broken: [], errors: [], ptr: false };
    if (domain) state.visited[domain] = true;
    await countSpfLookups(record, dns, state, 0);
    return {
      status: 'present',
      record: record,
      all: allTerm ? allTerm.qualifier : (hasRedirect ? 'redirect' : null),
      includes: terms.filter(function (t) { return t.name === 'include'; }).map(function (t) { return t.value.toLowerCase(); }),
      lookups: state.count,
      brokenIncludes: state.broken,
      lookupErrors: state.errors,
      usesPtr: state.ptr
    };
  }

  // ---------- DMARC ----------
  function parseDmarc(record) {
    var tags = {};
    record.split(';').forEach(function (part) {
      var idx = part.indexOf('=');
      if (idx === -1) return;
      var k = part.slice(0, idx).trim().toLowerCase();
      if (k) tags[k] = part.slice(idx + 1).trim();
    });
    return tags;
  }

  async function analyzeDmarc(domain, org, dns) {
    var name = '_dmarc.' + domain;
    var recs = (await dns.txt(name)).filter(function (t) { return /^v\s*=\s*dmarc1/i.test(t.trim()); });
    var inherited = false;
    if (!recs.length && org !== domain) {
      recs = (await dns.txt('_dmarc.' + org)).filter(function (t) { return /^v\s*=\s*dmarc1/i.test(t.trim()); });
      inherited = recs.length > 0;
    }
    if (!recs.length) return { status: 'missing' };
    if (recs.length > 1) return { status: 'multiple', records: recs };
    var tags = parseDmarc(recs[0]);
    var policy = (inherited && tags.sp ? tags.sp : tags.p || '').toLowerCase();
    if (['none', 'quarantine', 'reject'].indexOf(policy) === -1) return { status: 'invalid', record: recs[0], tags: tags };
    var pct = tags.pct === undefined ? 100 : parseInt(tags.pct, 10);
    return {
      status: 'present', record: recs[0], tags: tags, policy: policy,
      pct: isNaN(pct) ? 100 : pct, rua: tags.rua || null, inherited: inherited
    };
  }

  // ---------- DKIM ----------
  async function analyzeDkim(domain, provider, dns, extraSelectors) {
    var selectors = [];
    (extraSelectors || []).concat(provider ? provider.dkim : [], COMMON_SELECTORS).forEach(function (s) {
      if (s && selectors.indexOf(s) === -1) selectors.push(s);
    });
    var results = await Promise.all(selectors.map(function (sel) {
      return dns.txt(sel + '._domainkey.' + domain).then(function (txts) {
        var rec = txts.filter(function (t) { return /(^|;)\s*p\s*=/i.test(t) || /^v=dkim1/i.test(t.trim()); })[0];
        if (!rec) return null;
        var p = /(?:^|;)\s*p\s*=\s*([^;]*)/i.exec(rec);
        return { selector: sel, revoked: !p || !p[1].trim() };
      }, function () { return null; });
    }));
    var found = results.filter(function (r) { return r && !r.revoked; });
    return { status: found.length ? 'found' : 'not_found', selectors: found.map(function (r) { return r.selector; }), probed: selectors.length };
  }

  // ---------- Scoring & fixes ----------
  function grade(score) { return score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 55 ? 'C' : score >= 35 ? 'D' : 'F'; }

  function buildFindingsAndFixes(r) {
    var f = [], fixes = [], score = 0, d = r.domain, org = r.orgDomain;
    var rua = 'mailto:dmarc-reports@' + org;
    var spf = r.spf, dmarc = r.dmarc, dkim = r.dkim, prov = r.provider;

    if (!r.receivesMail) {
      // Domain receives no mail: the only safe posture is a full lockdown.
      var spfLocked = spf.status === 'present' && spf.all === '-' && spf.includes.length === 0;
      var dmarcLocked = dmarc.status === 'present' && dmarc.policy === 'reject';
      f.push({ severity: 'low', code: 'no_mx' });
      if (spfLocked) { score += 50; f.push({ severity: 'ok', code: 'parked_spf_ok' }); }
      else { f.push({ severity: 'high', code: 'parked_spf' }); fixes.push({ code: 'fix_parked_spf', type: 'TXT', host: '@', fqdn: d, value: 'v=spf1 -all' }); }
      if (dmarcLocked) { score += 50; f.push({ severity: 'ok', code: 'parked_dmarc_ok' }); }
      else { f.push({ severity: 'critical', code: 'parked_dmarc' }); fixes.push({ code: 'fix_parked_dmarc', type: 'TXT', host: '_dmarc', fqdn: '_dmarc.' + d, value: 'v=DMARC1; p=reject; adkim=s; aspf=s' }); }
      return { findings: f, fixes: fixes, score: score, spoofable: !dmarcLocked };
    }

    // SPF — 30 points
    var provInclude = prov ? prov.spf : null;
    if (spf.status === 'missing') {
      f.push({ severity: 'critical', code: 'spf_missing' });
      fixes.push({ code: 'fix_spf_new', type: 'TXT', host: '@', fqdn: d, value: 'v=spf1 ' + (provInclude || 'include:YOUR-EMAIL-PROVIDER') + ' ~all', needsInput: !provInclude });
    } else if (spf.status === 'multiple') {
      f.push({ severity: 'critical', code: 'spf_multiple', params: { n: spf.records.length } });
      var mech = [];
      spf.records.forEach(function (rec) {
        parseSpfTerms(rec).forEach(function (t) { if (t.name !== 'all' && mech.indexOf(t.raw) === -1) mech.push(t.raw); });
      });
      if (provInclude && mech.indexOf(provInclude) === -1) mech.unshift(provInclude);
      fixes.push({ code: 'fix_spf_merge', type: 'TXT', host: '@', fqdn: d, value: 'v=spf1 ' + mech.join(' ') + ' ~all' });
    } else {
      var spfPts = 30, rebuild = false, terms = parseSpfTerms(spf.record);
      if (spf.all === '+') { spfPts = 0; rebuild = true; f.push({ severity: 'critical', code: 'spf_plus_all' }); }
      else if (spf.all === '?') { spfPts = 10; rebuild = true; f.push({ severity: 'high', code: 'spf_neutral_all' }); }
      else if (spf.all === null) { spfPts = 10; rebuild = true; f.push({ severity: 'high', code: 'spf_no_all' }); }
      if (spf.lookups > 10) { spfPts = Math.min(spfPts, 5); f.push({ severity: 'critical', code: 'spf_too_many_lookups', params: { n: spf.lookups } }); }
      else if (spf.lookups >= 8) f.push({ severity: 'medium', code: 'spf_near_limit', params: { n: spf.lookups } });
      if (spf.brokenIncludes.length) { spfPts = Math.min(spfPts, 5); f.push({ severity: 'critical', code: 'spf_broken_include', params: { list: spf.brokenIncludes.join(', ') } }); }
      if (spf.usesPtr) f.push({ severity: 'low', code: 'spf_ptr' });
      var missingProv = provInclude && spf.includes.indexOf(provInclude.slice(8)) === -1 && spf.all !== 'redirect';
      if (missingProv) { spfPts = Math.min(spfPts, 15); rebuild = true; f.push({ severity: 'high', code: 'spf_missing_provider', params: { provider: prov.name, include: provInclude } }); }
      if (rebuild) {
        var kept = terms.filter(function (t) { return t.name !== 'all'; }).map(function (t) { return t.raw; });
        if (missingProv) kept.unshift(provInclude);
        fixes.push({ code: 'fix_spf_update', type: 'TXT', host: '@', fqdn: d, value: 'v=spf1 ' + kept.join(' ') + ' ~all' });
      }
      if (spfPts === 30) f.push({ severity: 'ok', code: 'spf_ok', params: { all: spf.all } });
      score += spfPts;
    }

    // DMARC — 40 points
    var enforced = false;
    var dmarcFqdn = '_dmarc.' + (dmarc.inherited ? org : d);
    if (dmarc.status === 'missing') {
      f.push({ severity: 'critical', code: 'dmarc_missing' });
      fixes.push({ code: 'fix_dmarc_new', type: 'TXT', host: '_dmarc', fqdn: '_dmarc.' + d, value: 'v=DMARC1; p=none; rua=' + rua + '; fo=1' });
    } else if (dmarc.status === 'multiple') {
      f.push({ severity: 'critical', code: 'dmarc_multiple', params: { n: dmarc.records.length } });
      fixes.push({ code: 'fix_dmarc_new', type: 'TXT', host: '_dmarc', fqdn: '_dmarc.' + d, value: 'v=DMARC1; p=none; rua=' + rua + '; fo=1' });
    } else if (dmarc.status === 'invalid') {
      f.push({ severity: 'critical', code: 'dmarc_invalid' });
      fixes.push({ code: 'fix_dmarc_new', type: 'TXT', host: '_dmarc', fqdn: '_dmarc.' + d, value: 'v=DMARC1; p=none; rua=' + rua + '; fo=1' });
    } else {
      var reportTo = dmarc.rua || rua;
      if (dmarc.policy === 'none') {
        score += 15;
        f.push({ severity: 'high', code: 'dmarc_none' });
        fixes.push({ code: 'fix_dmarc_quarantine', type: 'TXT', host: '_dmarc', fqdn: dmarcFqdn, value: 'v=DMARC1; p=quarantine; pct=100; rua=' + reportTo + '; fo=1', staged: true });
      } else if (dmarc.policy === 'quarantine') {
        enforced = dmarc.pct >= 100;
        score += dmarc.pct >= 100 ? 32 : 25;
        f.push({ severity: dmarc.pct >= 100 ? 'low' : 'medium', code: dmarc.pct >= 100 ? 'dmarc_quarantine' : 'dmarc_partial', params: { pct: dmarc.pct } });
        fixes.push({ code: 'fix_dmarc_reject', type: 'TXT', host: '_dmarc', fqdn: dmarcFqdn, value: 'v=DMARC1; p=reject; rua=' + reportTo + '; fo=1', staged: true });
      } else {
        enforced = dmarc.pct >= 100;
        score += dmarc.pct >= 100 ? 40 : 30;
        f.push({ severity: dmarc.pct >= 100 ? 'ok' : 'medium', code: dmarc.pct >= 100 ? 'dmarc_reject' : 'dmarc_partial', params: { pct: dmarc.pct } });
      }
      if (!dmarc.rua) {
        score -= 5;
        f.push({ severity: 'medium', code: 'dmarc_no_rua' });
        if (!fixes.some(function (x) { return x.host === '_dmarc'; })) {
          fixes.push({ code: 'fix_dmarc_rua', type: 'TXT', host: '_dmarc', fqdn: dmarcFqdn, value: dmarc.record.replace(/;?\s*$/, '') + '; rua=' + rua });
        }
      }
      if (dmarc.inherited) f.push({ severity: 'low', code: 'dmarc_inherited', params: { org: org } });
    }

    // DKIM — 30 points
    if (dkim.status === 'found') { score += 30; f.push({ severity: 'ok', code: 'dkim_ok', params: { list: dkim.selectors.join(', ') } }); }
    else {
      // Unverifiable rather than proven absent: DKIM may use a custom selector (big senders often do).
      score += 10;
      f.push({ severity: 'high', code: 'dkim_not_found', params: { n: dkim.probed } });
      fixes.push({ code: prov ? 'fix_dkim_' + prov.id.replace(/-eu$/, '') : 'fix_dkim_generic', type: 'INFO', host: '', fqdn: '', value: '' });
    }

    // Transport security — informational
    if (r.mtaSts === false) f.push({ severity: 'low', code: 'mta_sts_missing' });
    if (r.tlsRpt === false) f.push({ severity: 'low', code: 'tls_rpt_missing' });

    return { findings: f, fixes: fixes, score: Math.max(0, Math.min(100, score)), spoofable: !enforced };
  }

  async function scan(rawDomain, dns, opts) {
    opts = opts || {};
    var domain = normalizeDomain(rawDomain);
    if (!domain) { var err = new Error('invalid_domain'); err.code = 'invalid_domain'; throw err; }
    var org = orgDomain(domain);
    var mxP = dns.mx(domain);
    var txtP = dns.txt(domain);
    txtP.catch(function () {}); // handled below; avoids an unhandled rejection if MX fails first
    var mx = await mxP;
    // RFC 7505 null MX ("0 .") means the domain explicitly accepts no mail.
    var realMx = mx.filter(function (m) { return m.host && m.host !== '.'; });
    var provider = detectProvider(realMx);
    var results = await Promise.all([
      txtP.then(function (txts) { return analyzeSpf(txts, dns, domain); }),
      analyzeDmarc(domain, org, dns),
      realMx.length ? analyzeDkim(domain, provider, dns, opts.selectors) : Promise.resolve({ status: 'skipped', selectors: [], probed: 0 }),
      realMx.length ? dns.txt('_mta-sts.' + domain).then(function (t) { return t.some(function (x) { return /^v=stsv1/i.test(x.trim()); }); }, function () { return null; }) : null,
      realMx.length ? dns.txt('_smtp._tls.' + domain).then(function (t) { return t.some(function (x) { return /^v=tlsrptv1/i.test(x.trim()); }); }, function () { return null; }) : null
    ]);
    var r = {
      domain: domain, orgDomain: org, scannedAt: new Date().toISOString(),
      mx: realMx.sort(function (a, b) { return a.priority - b.priority; }),
      receivesMail: realMx.length > 0,
      provider: provider ? { id: provider.id, name: provider.name } : null,
      spf: results[0], dmarc: results[1], dkim: results[2], mtaSts: results[3], tlsRpt: results[4]
    };
    var out = buildFindingsAndFixes(Object.assign({}, r, { provider: provider }));
    r.findings = out.findings;
    r.fixes = out.fixes;
    r.score = out.score;
    r.grade = grade(out.score);
    r.spoofable = out.spoofable;
    return r;
  }


  // ---------- Lookalike domains ----------
  // Scammers impersonating a law firm usually register a near-identical domain (cohen-iaw.co.il, cohenlaw.com)
  // and write to clients at the moment of payment. DMARC cannot stop that; watching for new registrations can.
  var HOMOGLYPHS = { l: ['1', 'i'], i: ['1', 'l'], o: ['0'], '0': ['o'], m: ['rn'], w: ['vv'], e: ['3'], s: ['5'], a: ['4'], g: ['q'], n: ['m'] };
  var ALT_SUFFIXES = ['co.il', 'com', 'org.il', 'net', 'co', 'org', 'net.il', 'info', 'law'];
  var LAW_WORDS = ['law', 'adv', 'legal', 'lawyers', 'office'];

  function lookalikeCandidates(domain, limit) {
    var org = orgDomain(normalizeDomain(domain) || domain);
    var dot = org.indexOf('.');
    var name = org.slice(0, dot), suffix = org.slice(dot + 1);
    var out = [], seen = {};
    function add(n, sfx, technique) {
      n = n.replace(/^-+|-+$/g, '').replace(/--+/g, '-');
      var cand = n + '.' + (sfx || suffix);
      if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(n) || cand === org || seen[cand]) return;
      seen[cand] = true;
      out.push({ domain: cand, technique: technique });
    }
    var i;
    for (i = 0; i < name.length; i++) {
      var ch = name.charAt(i);
      (HOMOGLYPHS[ch] || []).forEach(function (g) { add(name.slice(0, i) + g + name.slice(i + 1), null, 'homoglyph'); });
    }
    if (name.indexOf('rn') !== -1) add(name.replace('rn', 'm'), null, 'homoglyph');
    if (name.indexOf('-') !== -1) add(name.replace(/-/g, ''), null, 'hyphen');
    else for (i = 2; i < name.length - 1; i++) add(name.slice(0, i) + '-' + name.slice(i), null, 'hyphen');
    for (i = 0; i < name.length - 1; i++) if (name[i] !== name[i + 1]) add(name.slice(0, i) + name[i + 1] + name[i] + name.slice(i + 2), null, 'swap');
    if (name.length > 4) for (i = 0; i < name.length; i++) add(name.slice(0, i) + name.slice(i + 1), null, 'omission');
    for (i = 0; i < name.length; i++) if (/[a-z]/.test(name[i])) add(name.slice(0, i + 1) + name[i] + name.slice(i + 1), null, 'repetition');
    ALT_SUFFIXES.forEach(function (sfx) { if (sfx !== suffix) add(name, sfx, 'tld'); });
    // Add legal words only to bare names; stripping a word (cohen-law -> cohen) would flag unrelated owners.
    if (!LAW_WORDS.some(function (w) { return name.indexOf(w) !== -1; })) {
      LAW_WORDS.forEach(function (w) { add(name + w, null, 'word'); add(name + '-' + w, null, 'word'); add(name + w, 'com', 'word'); });
    }
    // Most convincing first: homoglyph, word, tld, hyphen, then mechanical typos.
    var rank = { homoglyph: 0, word: 1, tld: 2, hyphen: 3, swap: 4, omission: 5, repetition: 6 };
    out.sort(function (a, b) { return rank[a.technique] - rank[b.technique]; });
    return out.slice(0, limit || 120);
  }

  async function findLookalikes(domain, dns, opts) {
    opts = opts || {};
    var cands = lookalikeCandidates(domain, opts.limit);
    var found = [], idx = 0, done = 0, errors = 0;
    async function worker() {
      while (idx < cands.length) {
        var c = cands[idx++];
        try {
          var ns = await dns.ns(c.domain);
          if (!ns.length) continue;
          var mx = [];
          try { mx = (await dns.mx(c.domain)).filter(function (m) { return m.host && m.host !== '.'; }); } catch (e) { /* treat as unknown */ }
          found.push({ domain: c.domain, technique: c.technique, mail: mx.length > 0, ns: ns.slice(0, 2) });
        } catch (e) { errors++; }
        finally { done++; if (opts.onProgress) opts.onProgress(done, cands.length); }
      }
    }
    var workers = [];
    for (var w = 0; w < (opts.concurrency || 6); w++) workers.push(worker());
    await Promise.all(workers);
    found.sort(function (a, b) { return (b.mail - a.mail) || a.domain.localeCompare(b.domain); });
    return { checked: cands.length, found: found, errors: errors };
  }

  // ---------- Browser DNS-over-HTTPS adapter ----------
  function parseTxtData(data) {
    if (data.charAt(0) !== '"') return data;
    var out = '', re = /"((?:[^"\\]|\\.)*)"/g, m;
    while ((m = re.exec(data))) out += m[1].replace(/\\(\d{3})/g, function (_, n) { return String.fromCharCode(parseInt(n, 10)); }).replace(/\\(.)/g, '$1');
    return out;
  }

  function dohAdapter(fetchImpl, options) {
    options = options || {};
    var f = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(self) : null);
    var timeoutMs = options.timeoutMs || 6000;
    var endpoints = options.endpoints || [
      { url: 'https://cloudflare-dns.com/dns-query', headers: { accept: 'application/dns-json' } },
      { url: 'https://dns.google/resolve', headers: {} }
    ];
    var cache = {};
    async function query(name, type) {
      var key = type + ' ' + name;
      if (cache[key]) return cache[key];
      var p = (async function () {
        var lastErr;
        for (var i = 0; i < endpoints.length; i++) {
          var ep = endpoints[i];
          var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
          var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs) : null;
          try {
            var res = await f(ep.url + '?name=' + encodeURIComponent(name) + '&type=' + type, { headers: ep.headers, signal: ctrl ? ctrl.signal : undefined });
            if (!res.ok) throw new Error('http_' + res.status);
            var json = await res.json();
            if (json.Status === 3) return [];            // NXDOMAIN
            if (json.Status !== 0) throw new Error('dns_status_' + json.Status);
            var want = { TXT: 16, MX: 15, NS: 2 }[type];
            return (json.Answer || []).filter(function (a) { return a.type === want; }).map(function (a) { return a.data; });
          } catch (e) { lastErr = e; }
          finally { if (timer) clearTimeout(timer); }
        }
        var err = new Error('dns_unavailable'); err.code = 'dns_unavailable'; err.cause = lastErr; throw err;
      })();
      cache[key] = p;
      p.catch(function () { delete cache[key]; });
      return p;
    }
    return {
      txt: function (name) { return query(name, 'TXT').then(function (arr) { return arr.map(parseTxtData); }); },
      mx: function (name) {
        return query(name, 'MX').then(function (arr) {
          return arr.map(function (d) { var p = d.trim().split(/\s+/); return { priority: parseInt(p[0], 10), host: (p[1] || '').replace(/\.$/, '') || '.' }; });
        });
      },
      ns: function (name) { return query(name, 'NS').then(function (arr) { return arr.map(function (d) { return d.replace(/\.$/, ''); }); }); }
    };
  }

  return {
    scan: scan, findLookalikes: findLookalikes, lookalikeCandidates: lookalikeCandidates, normalizeDomain: normalizeDomain, orgDomain: orgDomain, dohAdapter: dohAdapter,
    parseTxtData: parseTxtData, parseDmarc: parseDmarc, PROVIDERS: PROVIDERS, COMMON_SELECTORS: COMMON_SELECTORS
  };
});
