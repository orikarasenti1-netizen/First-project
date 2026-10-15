// Shared rendering helpers (no Firebase dependency, safe for the landing page too).
export function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style') e.style.cssText = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return e;
}

export function punchCard(b, stamps, opts = {}) {
  const goal = b.goal;
  const shown = Math.min(stamps, goal);
  const holes = el('div', { class: 'holes', style: goal <= 6 ? 'grid-template-columns:repeat(' + goal + ',1fr)' : '' });
  for (let i = 0; i < goal; i++) {
    const on = i < shown;
    const cls = 'hole' + (on ? ' on' : '') + (i === goal - 1 ? ' gift' : '') + (on && opts.popFrom != null && i >= opts.popFrom ? ' pop' : '');
    holes.append(el('div', { class: cls, 'aria-hidden': 'true' }, on && i !== goal - 1 ? b.emoji : ''));
  }
  const left = Math.max(0, goal - stamps);
  const card = el('section', { class: 'punch', style: '--c:' + b.color, 'aria-label': `כרטיסייה: ${shown} מתוך ${goal} חותמות` },
    el('div', { class: 'punch-head' },
      el('span', { class: 'punch-emoji', 'aria-hidden': 'true' }, b.emoji),
      el('div', {}, el('div', { class: 'punch-name' }, b.name), el('div', { class: 'punch-reward' }, `${goal} חותמות = ${b.reward}`))),
    holes,
    el('div', { class: 'punch-foot' },
      el('span', { class: 'progress-txt' }, left === 0 ? el('b', {}, 'ההטבה מחכה לך!') : ['עוד ', el('b', {}, String(left)), ` ל${b.reward}`]),
      el('b', { dir: 'ltr' }, `${shown}/${goal}`)));
  return card;
}

export function toast(msg, ms = 2200) {
  const t = el('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}

export function qrSvg(text, cellSize = 6) {
  // qrcode-generator (vendor/qrcode.js, MIT) is loaded as a classic script.
  const q = window.qrcode(0, 'M');
  q.addData(text);
  q.make();
  const wrap = el('div', { class: 'qr' });
  wrap.innerHTML = q.createSvgTag({ cellSize, margin: 2, scalable: true });
  return wrap;
}

export function ago(ts) {
  if (!ts || !ts.toMillis) return 'עדיין לא ביקר/ה';
  const d = Math.floor((Date.now() - ts.toMillis()) / 864e5);
  if (d <= 0) return 'היום';
  if (d === 1) return 'אתמול';
  if (d < 7) return `לפני ${d} ימים`;
  if (d < 14) return 'לפני שבוע';
  return `לפני ${Math.floor(d / 7)} שבועות`;
}
