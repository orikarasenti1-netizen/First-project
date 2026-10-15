(function () {
  'use strict';
  var CFG = window.MAILSEAL_CONFIG || {};
  var I18N = window.MAILSEAL_I18N;
  var dns = MailSeal.dohAdapter();
  var lang = detectLang();
  var last = null;
  var $ = function (id) { return document.getElementById(id); };

  function detectLang() {
    var q = new URLSearchParams(location.search).get('lang');
    if (q === 'he' || q === 'en') return q;
    try { var s = localStorage.getItem('mailseal-lang'); if (s === 'he' || s === 'en') return s; } catch (e) { /* storage blocked */ }
    return (navigator.language || '').toLowerCase().indexOf('he') === 0 ? 'he' : 'en';
  }
  function T(key, params) {
    var v = I18N[lang].ui[key];
    if (v === undefined) v = I18N.en.ui[key];
    if (typeof v === 'string' && params) v = v.replace(/\{(\w+)\}/g, function (_, k) { return params[k] !== undefined ? params[k] : ''; });
    return v;
  }
  function money(kind) {
    var p = (CFG.prices || {})[kind] || {};
    return lang === 'he' ? '₪' + p.ils : '$' + p.usd;
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // ---------- i18n ----------
  function applyLang() {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach(function (n) { n.textContent = T(n.getAttribute('data-i18n')); });
    document.querySelectorAll('[data-i18n-html]').forEach(function (n) { n.innerHTML = T(n.getAttribute('data-i18n-html')); });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (n) { n.placeholder = T(n.getAttribute('data-i18n-ph')); });
    document.querySelectorAll('[data-i18n-list]').forEach(function (n) {
      n.textContent = '';
      T(n.getAttribute('data-i18n-list')).forEach(function (item) { n.appendChild(el('li', '', item)); });
    });
    document.querySelectorAll('.cur').forEach(function (n) { n.textContent = lang === 'he' ? '₪' : '$'; });

    var spots = CFG.foundingSpotsLeft || 0;
    var fix = $('price-fix');
    fix.textContent = '';
    fix.appendChild(document.createTextNode(spots > 0 ? money('founding') : money('fix')));
    if (spots > 0) fix.appendChild(el('s', '', money('fix')));
    fix.appendChild(el('small', '', ' ' + T('plan_fix_unit')));
    $('founding-fix').textContent = spots > 0 ? T('founding', { n: spots }) : '';
    var watch = $('price-watch');
    watch.textContent = money('watch');
    watch.appendChild(el('small', '', ' ' + T('plan_watch_unit')));

    var faq = $('faq-list');
    faq.textContent = '';
    T('faq').forEach(function (qa) {
      var d = el('details'); d.appendChild(el('summary', '', qa[0])); d.appendChild(el('p', '', qa[1])); faq.appendChild(d);
    });
    document.title = lang === 'he' ? 'MailSeal — האם אפשר להתחזות למייל של העסק שלך?' : 'MailSeal — Can a scammer send email as you?';
    if (last) renderResult(last);
  }

  $('lang-toggle').addEventListener('click', function () {
    lang = lang === 'he' ? 'en' : 'he';
    try { localStorage.setItem('mailseal-lang', lang); } catch (e) { /* storage blocked */ }
    applyLang();
  });

  // ---------- Scan ----------
  var domainInput = $('domain');
  domainInput.addEventListener('input', function () {
    var d = MailSeal.normalizeDomain(domainInput.value);
    $('env-domain').textContent = d || 'yourcompany.com';
  });

  function setStamp(state, text) {
    var s = $('stamp');
    s.className = 'stamp' + (state ? ' ' + state : '');
    $('stamp-text').textContent = text;
  }

  $('scan-form').addEventListener('submit', function (e) { e.preventDefault(); runScan(domainInput.value); });

  async function runScan(raw) {
    var err = $('scan-error');
    err.hidden = true;
    var d = MailSeal.normalizeDomain(raw);
    if (!d) { err.textContent = T('err_invalid'); err.hidden = false; return; }
    domainInput.value = d;
    $('env-domain').textContent = d;
    var btn = $('scan-btn');
    btn.disabled = true; btn.textContent = T('scanning');
    setStamp('spin', '…');
    try {
      last = await MailSeal.scan(d, dns);
      renderResult(last);
      $('results').hidden = false;
      $('order-domain').value = d;
      var u = new URL(location.href); u.searchParams.set('d', d); history.replaceState(null, '', u);
      $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (ex) {
      err.textContent = ex && ex.code === 'invalid_domain' ? T('err_invalid') : T('err_dns');
      err.hidden = false;
      setStamp('', '?');
    } finally {
      btn.disabled = false; btn.textContent = T('btn_check');
    }
  }

  function cardState(kind, r) {
    if (kind === 'spf') {
      if (r.spf.status !== 'present') return 'bad';
      return r.findings.some(function (f) { return /^spf_/.test(f.code) && (f.severity === 'critical' || f.severity === 'high'); }) ? 'warn' : 'ok';
    }
    if (kind === 'dkim') return r.dkim.status === 'skipped' ? 'na' : r.dkim.status === 'found' ? 'ok' : 'bad';
    if (r.dmarc.status !== 'present') return 'bad';
    return r.spoofable ? 'warn' : 'ok';
  }

  function renderResult(r) {
    var tr = I18N[lang];
    setStamp(r.spoofable ? 'bad' : 'good', r.spoofable ? (lang === 'he' ? 'ניתן לזיוף' : 'Forgeable') : (lang === 'he' ? 'חתום' : 'Sealed'));
    $('rp-domain').textContent = r.domain;
    $('rp-date').textContent = new Date(r.scannedAt).toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB');
    $('verdict').className = 'verdict' + (r.spoofable ? '' : ' safe');
    $('grade-seal').className = 'grade-seal g-' + r.grade;
    $('grade').textContent = r.grade;
    $('verdict-title').textContent = r.spoofable ? T('verdict_spoofable') : T('verdict_safe');
    $('verdict-sub').textContent = T(r.spoofable ? 'verdict_spoofable_sub' : 'verdict_safe_sub', { domain: r.domain });
    $('score').textContent = r.score;
    $('provider').textContent = !r.receivesMail ? T('no_mail') : r.provider ? r.provider.name : T('provider_unknown');

    var cards = $('cards'); cards.textContent = '';
    [['spf', 'card_spf', 'card_spf_desc'], ['dkim', 'card_dkim', 'card_dkim_desc'], ['dmarc', 'card_dmarc', 'card_dmarc_desc']].forEach(function (c) {
      var st = r.receivesMail || c[0] !== 'dkim' ? cardState(c[0], r) : 'na';
      var card = el('div', 'card'), h = el('h4', '', T(c[1]));
      h.appendChild(el('span', 'pill ' + st, T('st_' + st)));
      card.appendChild(h); card.appendChild(el('p', '', T(c[2])));
      cards.appendChild(card);
    });

    var order = { critical: 0, high: 1, medium: 2, low: 3, ok: 4 };
    var list = $('findings'); list.textContent = '';
    r.findings.slice().sort(function (a, b) { return order[a.severity] - order[b.severity]; }).forEach(function (f) {
      var li = el('li');
      li.appendChild(el('span', 'sev sev-' + f.severity, tr.sev[f.severity]));
      var fn = tr.findings[f.code];
      li.appendChild(el('span', '', fn ? fn(f.params || {}) : f.code));
      list.appendChild(li);
    });

    var fixes = $('fixes'); fixes.textContent = '';
    $('fixes-sub').hidden = !r.fixes.length;
    if (!r.fixes.length) fixes.appendChild(el('p', 'sub', T('fixes_none')));
    r.fixes.forEach(function (x) {
      var copy = tr.fixes[x.code] || [x.code, ''];
      var box = el('div', 'fix');
      box.appendChild(el('h4', '', copy[0]));
      if (copy[1]) box.appendChild(el('p', '', copy[1]));
      if (x.staged) box.appendChild(el('p', 'staged', T('staged_note')));
      if (x.needsInput) box.appendChild(el('p', 'staged', T('needs_input_note')));
      if (x.type === 'TXT') {
        var rec = el('div', 'rec');
        [['col_type', x.type], ['col_host', x.fqdn], ['col_value', x.value]].forEach(function (col) {
          var cell = el('div'); cell.appendChild(el('span', 'k', T(col[0])));
          cell.appendChild(el('code', '', col[1])); rec.appendChild(cell);
        });
        var b = el('button', '', T('copy')); b.type = 'button';
        b.addEventListener('click', function () { copyText(x.value, b); });
        rec.appendChild(b);
        box.appendChild(rec);
      }
      fixes.appendChild(box);
    });

    $('share-btn').href = 'mailto:?subject=' + encodeURIComponent(T('report_title') + ': ' + r.domain) + '&body=' + encodeURIComponent(summaryText(r));
  }

  function summaryText(r) {
    var tr = I18N[lang];
    var lines = [T('report_title') + ' — ' + r.domain, T('grade') + ': ' + r.grade + ' (' + r.score + '/100)',
      r.spoofable ? T('verdict_spoofable') : T('verdict_safe'), ''];
    r.findings.filter(function (f) { return f.severity !== 'ok'; }).forEach(function (f) {
      lines.push('- [' + tr.sev[f.severity] + '] ' + tr.findings[f.code](f.params || {}));
    });
    if (r.fixes.length) {
      lines.push('', T('fixes_title') + ':');
      r.fixes.forEach(function (x) {
        lines.push('* ' + (tr.fixes[x.code] || [x.code])[0]);
        if (x.type === 'TXT') lines.push('  TXT  ' + x.fqdn + '  "' + x.value + '"');
      });
    }
    lines.push('', location.origin + location.pathname + '?d=' + encodeURIComponent(r.domain) + '&lang=' + lang);
    return lines.join('\n');
  }

  function copyText(text, btn) {
    var done = function () { if (btn) { var o = btn.textContent; btn.textContent = T('copied'); setTimeout(function () { btn.textContent = o; }, 1400); } };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    else { fallbackCopy(text); done(); }
  }
  function fallbackCopy(text) {
    var ta = el('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) { /* nothing else to try */ }
    ta.remove();
  }

  $('print-btn').addEventListener('click', function () { window.print(); });

  // ---------- Order ----------
  document.querySelectorAll('[data-plan]').forEach(function (a) {
    a.addEventListener('click', function () { $('order-plan').value = a.getAttribute('data-plan'); });
  });
  $('cta-order').addEventListener('click', function () { $('order-plan').value = 'fix'; });

  $('order-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, err = $('order-error');
    var data = { name: f.name.value.trim(), email: f.email.value.trim(), domain: MailSeal.normalizeDomain(f.domain.value), plan: f.plan.value, dns: f.dns.value.trim(), msg: f.msg.value.trim() };
    if (!data.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) || !data.domain) { err.textContent = T('err_required'); err.hidden = false; return; }
    err.hidden = true;
    var planLabel = f.plan.options[f.plan.selectedIndex].textContent;
    var body = [
      'Plan: ' + planLabel, 'Name: ' + data.name, 'Email: ' + data.email, 'Domain: ' + data.domain,
      'DNS managed at: ' + (data.dns || '-'), 'Language: ' + lang, '', data.msg || ''
    ];
    if (last && last.domain === data.domain) body.push('', '---', summaryText(last));
    var subject = 'MailSeal request: ' + data.domain + ' — ' + planLabel;
    var text = body.join('\n');
    $('order-message').textContent = 'Subject: ' + subject + '\n\n' + text;
    $('order-done').hidden = false;
    if (CFG.contactEmail) {
      $('order-done-t').textContent = T('order_sent_t');
      $('order-done-b').textContent = T('order_sent_b');
      $('order-message').textContent = 'To: ' + CFG.contactEmail + '\n' + $('order-message').textContent;
      location.href = 'mailto:' + encodeURIComponent(CFG.contactEmail) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(text);
    } else {
      $('order-done-t').textContent = T('order_sent_t');
      $('order-done-b').textContent = T('order_nocontact');
    }
    $('order-done').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  $('copy-order').addEventListener('click', function () { copyText($('order-message').textContent, $('copy-order')); });

  // ---------- Boot ----------
  applyLang();
  var initial = new URLSearchParams(location.search).get('d');
  if (initial) { domainInput.value = initial; runScan(initial); }
})();
