// Business owner app.
import * as S from './store.js';
import { el, punchCard, toast, qrSvg, ago } from './ui.js';

const $ = id => document.getElementById(id);
const CFG = window.CHOZRIM_CONFIG || {};
const OP = CFG.operator || {};
const COLORS = ['#B4532A', '#1F6F5C', '#2C4C9A', '#8A2D5E', '#C2851B', '#1E2740', '#5B3A8C', '#2E7D32'];
const EMOJIS = ['☕', '🥐', '🍕', '💈', '💅', '🍦', '🥙', '🌮', '🧁', '🍣', '🐾', '🧺', '🌸', '🏋️'];
let user = null, biz = null, members = [], membersLoaded = 0, code = '', current = null, filter = 'all';
let editing = { color: COLORS[0], emoji: EMOJIS[0] };

function show(id) { ['loading', 'setup', 'auth', 'editor', 'main'].forEach(x => { $(x).hidden = x !== id; }); }
const fail = (node, msg) => { node.textContent = msg; node.hidden = false; };

// ---------- Boot & auth ----------
if (!S.configured) show('setup');
else S.onUser(async u => {
  user = u;
  $('who-wrap').hidden = !u;
  if (!u) return show('auth');
  $('who').textContent = u.email || '';
  show('loading');
  try {
    const list = await S.myBusinesses(u.uid);
    if (!list.length) return openEditor(null);
    biz = list[0];
    enterMain();
  } catch (e) { show('setup'); $('setup').firstElementChild.textContent = 'אין חיבור למסד הנתונים כרגע. נסו לרענן.'; }
});

$('logout').onclick = () => S.logOut();
$('google').onclick = () => S.signInGoogle().catch(e => fail($('auth-err'), authMsg(e)));
$('auth-form').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, mode = e.submitter && e.submitter.dataset.mode;
  $('auth-err').hidden = true;
  try {
    if (mode === 'up') await S.signUpEmail(f.email.value.trim(), f.pw.value);
    else await S.signInEmail(f.email.value.trim(), f.pw.value);
  } catch (ex) { fail($('auth-err'), authMsg(ex)); }
});
$('reset').onclick = async () => {
  const email = $('auth-form').email.value.trim();
  if (!email) return fail($('auth-err'), 'כתבו את המייל ואז לחצו שוב');
  try { await S.resetPassword(email); toast('שלחנו מייל לאיפוס סיסמה'); } catch (ex) { fail($('auth-err'), authMsg(ex)); }
};
function authMsg(e) {
  const c = (e && e.code) || '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return 'מייל או סיסמה לא נכונים';
  if (c.includes('email-already-in-use')) return 'המייל הזה כבר רשום — לחצו "כניסה"';
  if (c.includes('weak-password')) return 'הסיסמה קצרה מדי (לפחות 6 תווים)';
  if (c.includes('invalid-email')) return 'כתובת מייל לא תקינה';
  if (c.includes('popup')) return 'החלון נסגר. נסו שוב';
  return 'הכניסה נכשלה. נסו שוב';
}

// ---------- Card editor ----------
function openEditor(existing) {
  const f = $('card-form');
  editing = { color: existing ? existing.color : COLORS[0], emoji: existing ? existing.emoji : EMOJIS[0] };
  f.name.value = existing ? existing.name : '';
  f.reward.value = existing ? existing.reward : '';
  f.goal.value = existing ? String(existing.goal) : '10';
  if (existing && ![...f.goal.options].some(o => o.value === String(existing.goal))) f.goal.append(el('option', {}, String(existing.goal)));
  f.goal.value = existing ? String(existing.goal) : '10';
  f.whatsapp.value = existing && existing.whatsapp ? '0' + existing.whatsapp.replace(/^972/, '') : '';
  $('editor-title').textContent = existing ? 'עריכת הכרטיסייה' : 'בואו נעצב את הכרטיסייה';
  $('card-save').textContent = existing ? 'שמירה' : 'יצירת הכרטיסייה';
  $('card-cancel').hidden = !existing;
  $('swatches').replaceChildren(...COLORS.map(c => el('button', { type: 'button', style: 'background:' + c, 'aria-label': 'צבע ' + c, 'aria-pressed': String(c === editing.color), onclick: () => { editing.color = c; openEditorRefresh(); } })));
  $('emojis').replaceChildren(...EMOJIS.map(x => el('button', { type: 'button', 'aria-pressed': String(x === editing.emoji), onclick: () => { editing.emoji = x; openEditorRefresh(); } }, x)));
  openEditorRefresh();
  show('editor');
}
function cardDraft() {
  const f = $('card-form');
  return S.cleanCard({ name: f.name.value || 'שם העסק', reward: f.reward.value || 'ההטבה שלכם', goal: f.goal.value, color: editing.color, emoji: editing.emoji, whatsapp: f.whatsapp.value });
}
function openEditorRefresh() {
  [...$('swatches').children].forEach(b => b.setAttribute('aria-pressed', String(b.style.background && b.getAttribute('aria-label') === 'צבע ' + editing.color)));
  [...$('emojis').children].forEach(b => b.setAttribute('aria-pressed', String(b.textContent === editing.emoji)));
  $('card-preview').replaceChildren(punchCard(cardDraft(), 3));
}
$('card-form').addEventListener('input', openEditorRefresh);
$('card-cancel').onclick = () => enterMain();
$('card-form').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  $('card-err').hidden = true;
  if (!f.name.value.trim() || !f.reward.value.trim()) return fail($('card-err'), 'צריך שם לעסק ותיאור של ההטבה');
  const data = { name: f.name.value, reward: f.reward.value, goal: f.goal.value, color: editing.color, emoji: editing.emoji, whatsapp: f.whatsapp.value };
  $('card-save').disabled = true;
  try {
    if (biz) { await S.updateBusiness(biz.id, data); }
    else { const id = await S.createBusiness(user.uid, data); biz = { id }; }
    biz = await S.getBusiness(biz.id);
    toast('נשמר ✓');
    enterMain(biz.createdAt && Date.now() - biz.createdAt.toMillis() < 60000 ? 'poster' : null);
  } catch (ex) { fail($('card-err'), 'השמירה נכשלה. בדקו חיבור ונסו שוב.'); }
  finally { $('card-save').disabled = false; }
});

// ---------- Main ----------
function joinUrl() {
  const u = new URL('c.html', location.href);
  u.searchParams.set('b', biz.id);
  return u.toString();
}
function cardLink(m) { const u = new URL(joinUrl()); u.searchParams.set('m', m.id); return u.toString(); }

function enterMain(tab) {
  document.documentElement.style.setProperty('--brand', biz.color);
  show('main');
  renderBilling();
  buildKeypad();
  selectTab(tab || 'register');
}

document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => selectTab(b.dataset.tab)));
function selectTab(name) {
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== name; });
  if (name === 'customers') renderCustomers();
  if (name === 'poster') renderPoster();
  if (name === 'register') loadMembers();
}

// ---------- Billing ----------
function payHref() {
  const text = `היי, אני רוצה להמשיך עם "חוזרים" עבור ${biz.name} (מזהה ${biz.id})`;
  if (OP.paymentLink) return OP.paymentLink;
  return OP.whatsapp ? S.waLink(OP.whatsapp, text) : null;
}
function renderBilling() {
  const b = S.billing(biz);
  const banner = $('billing-banner');
  banner.hidden = b.state === 'paid' || (b.state === 'trial' && b.daysLeft > 7);
  const href = payHref();
  const payBtn = href ? el('a', { class: 'btn brand', href, target: '_blank', rel: 'noopener', style: 'margin-top:10px' }, 'להמשך המנוי') : '';
  if (b.state === 'trial') banner.replaceChildren(el('div', { class: 'notice' }, `נשארו ${b.daysLeft} ימים לחודש הניסיון.`));
  if (b.state === 'grace') banner.replaceChildren(el('div', { class: 'notice bad' }, `חודש הניסיון הסתיים. ההחתמה תיעצר בעוד ${b.daysLeft} ימים.`, el('br'), payBtn));
  $('register-ok').hidden = !b.active;
  $('register-blocked').hidden = b.active;
  if (!b.active) $('register-blocked').replaceChildren(el('div', { class: 'notice bad' }, 'תקופת הניסיון הסתיימה וההחתמה עצורה. הלקוחות עדיין רואים את הכרטיסיות שלהם — שום דבר לא נמחק.', el('br'), payBtn));
  const price = `₪${OP.priceMonthly || 59} לחודש` + (OP.foundingPrice ? ` (ללקוחות ראשונים: ₪${OP.foundingPrice} לחודש, לתמיד)` : '');
  const status = { paid: `מנוי פעיל עד ${new Date(b.until).toLocaleDateString('he-IL')}`, trial: `חודש ניסיון — נשארו ${b.daysLeft} ימים`, grace: `הניסיון הסתיים — ${b.daysLeft} ימי חסד`, expired: 'המנוי לא פעיל' }[b.state];
  $('billing-detail').replaceChildren(el('p', {}, el('b', {}, status)), el('p', { class: 'fine' }, 'מחיר: ' + price + '. ביטול בכל רגע.'), b.state !== 'paid' && href ? el('a', { class: 'btn brand', href, target: '_blank', rel: 'noopener' }, 'תשלום / המשך מנוי') : '');
}
$('edit-card').onclick = () => openEditor(biz);

// ---------- Register (stamping) ----------
function buildKeypad() {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'clr'];
  $('keypad').replaceChildren(...keys.map(k => el('button', { type: 'button', 'aria-label': k === 'del' ? 'מחיקה' : k === 'clr' ? 'ניקוי' : k, onclick: () => press(k) }, k === 'del' ? '⌫' : k === 'clr' ? 'C' : k)));
  renderCode();
}
function press(k) {
  if (k === 'del') code = code.slice(0, -1);
  else if (k === 'clr') { code = ''; $('found').replaceChildren(); }
  else if (code.length < 4) code += k;
  renderCode();
  if (code.length === 4) lookup(code);
}
document.addEventListener('keydown', e => {
  if ($('main').hidden || document.querySelector('[data-panel="register"]').hidden || e.target.tagName === 'INPUT') return;
  if (/^[0-9]$/.test(e.key)) press(e.key);
  else if (e.key === 'Backspace') press('del');
  else if (e.key === 'Escape') press('clr');
});
function renderCode() {
  $('code-display').replaceChildren(...[0, 1, 2, 3].map(i => code[i] ? el('span', {}, code[i]) : el('span', { class: 'ph' }, '•')));
}
async function lookup(c) {
  $('found').replaceChildren(el('p', { class: 'fine', style: 'text-align:center' }, 'מחפש…'));
  try {
    const m = await S.findByCode(biz.id, c);
    if (!m) return $('found').replaceChildren(el('div', { class: 'notice bad', style: 'margin-top:12px' }, `לא נמצא לקוח עם הקוד ${c}`));
    showMember(m);
  } catch (e) { $('found').replaceChildren(el('div', { class: 'notice bad' }, 'אין חיבור. נסו שוב.')); }
}
function miniHoles(m) {
  const box = el('div', { class: 'mini-holes', 'aria-hidden': 'true' });
  for (let i = 0; i < biz.goal; i++) box.append(el('span', { class: i < m.stamps ? 'on' : '' }));
  return box;
}
function showMember(m) {
  current = m;
  const ready = m.stamps >= biz.goal;
  const busy = btn => { btn.disabled = true; };
  const act = async (fn, okMsg, btn) => {
    busy(btn);
    try { const r = await fn(); current = { ...m, ...r }; toast(okMsg); upsertMember(current); showMember(current); }
    catch (e) { toast(e.code === 'permission-denied' ? 'ההחתמה עצורה — המנוי לא פעיל' : 'לא הצליח. נסו שוב'); btn.disabled = false; }
  };
  const card = el('div', { class: 'found' },
    el('h3', {}, m.name),
    el('div', { class: 'fine' }, `קוד ${m.code} · ביקור אחרון: ${ago(m.lastVisit)} · מימש ${m.rewards || 0} הטבות`),
    miniHoles(m),
    el('div', { style: 'font-weight:700' }, ready ? `🎉 ההטבה מוכנה: ${biz.reward}` : `${m.stamps} מתוך ${biz.goal} חותמות`),
    el('div', { class: 'row' },
      el('button', { class: 'btn brand', type: 'button', id: 'stamp1', onclick: e => act(() => S.addStamps(biz.id, m.id, 1), 'נוספה חותמת ✓', e.currentTarget) }, '+1 חותמת'),
      el('button', { class: 'btn ghost', type: 'button', onclick: e => act(() => S.addStamps(biz.id, m.id, 2), 'נוספו 2 חותמות ✓', e.currentTarget) }, '+2'),
      ready ? el('button', { class: 'btn ok', type: 'button', id: 'redeem', onclick: e => act(() => S.redeem(biz.id, m.id, biz.goal), 'ההטבה מומשה 🎉', e.currentTarget) }, 'מימוש הטבה') : ''),
    m.phone ? el('div', { class: 'row' }, el('a', { class: 'btn ghost', href: S.waLink(m.phone, `הנה הכרטיסייה שלך ב${biz.name}: ${cardLink(m)}`), target: '_blank', rel: 'noopener' }, 'שליחת הקישור לכרטיסייה ללקוח')) : '');
  $('found').replaceChildren(card);
}

async function loadMembers(force) {
  if (!force && Date.now() - membersLoaded < 60000) return members;
  try { members = await S.listMembers(biz.id); membersLoaded = Date.now(); } catch (e) { /* keep cache */ }
  return members;
}
function upsertMember(m) { const i = members.findIndex(x => x.id === m.id); if (i === -1) members.push(m); else members[i] = m; }

$('search').addEventListener('input', async e => {
  const q = e.target.value.trim().toLowerCase();
  const box = $('search-results');
  if (q.length < 2) return box.replaceChildren();
  await loadMembers();
  const digits = q.replace(/\D/g, '');
  const hits = members.filter(m => m.name.toLowerCase().includes(q) || (digits.length >= 3 && m.phone.includes(digits))).slice(0, 6);
  box.replaceChildren(...(hits.length ? hits.map(m => el('button', { class: 'person', type: 'button', style: 'text-align:start;cursor:pointer', onclick: () => { box.replaceChildren(); e.target.value = ''; code = ''; renderCode(); showMember(m); } },
    el('div', {}, el('div', { class: 'nm' }, m.name), el('div', { class: 'meta' }, `קוד ${m.code} · ${m.stamps}/${biz.goal}`)))) : [el('p', { class: 'fine' }, 'לא נמצאו לקוחות')]));
});

$('show-join').onclick = () => {
  const box = $('join-qr');
  box.hidden = !box.hidden;
  if (!box.hidden) box.replaceChildren(qrSvg(joinUrl()), el('p', { class: 'fine' }, 'הלקוח סורק עם המצלמה ומצטרף. אחר כך הקלידו את הקוד שיקבל.'));
};

// ---------- Customers ----------
const FILTERS = [['all', 'כולם'], ['lapsed', 'לא חזרו 3 שבועות'], ['near', 'קרובים להטבה'], ['ready', 'הטבה מוכנה'], ['new', 'עוד לא ביקרו']];
const HINTS = {
  lapsed: 'אלה לקוחות שהיו ולא חזרו. הודעה אישית קצרה מחזירה חלק מהם — זה כל הסוד.',
  near: 'עוד חותמת-שתיים וההטבה שלהם. תזכורת קטנה עכשיו עובדת הכי טוב.',
  ready: 'יש להם הטבה שמחכה. הזכירו להם לבוא לממש.',
  new: 'הצטרפו אבל עוד לא קיבלו חותמת ראשונה.'
};
async function renderCustomers() {
  $('people').replaceChildren(el('p', { class: 'fine' }, 'טוען…'));
  const [ms, ev] = await Promise.all([loadMembers(true), S.recentEvents(biz.id).catch(() => [])]);
  const st = S.stats(ms, ev);
  const near = ms.filter(m => S.segment(m, biz.goal) === 'near').length;
  const tile = (n, t) => el('div', { class: 'stat' }, el('b', {}, String(n)), el('span', {}, t));
  $('stats').replaceChildren(tile(st.members, 'חברים בכרטיסייה'), tile(st.visitsThisWeek, 'ביקורים השבוע'), tile(st.returning, 'חזרו יותר מפעם אחת'), tile(st.lapsed, 'לא חזרו 3 שבועות'), tile(near, 'קרובים להטבה'), tile(st.rewardsThisWeek, 'הטבות מומשו השבוע'));
  const counts = { all: ms.length };
  ms.forEach(m => { const s = S.segment(m, biz.goal); counts[s] = (counts[s] || 0) + 1; });
  $('filters').replaceChildren(...FILTERS.map(([k, t]) => el('button', { type: 'button', 'aria-pressed': String(filter === k), onclick: () => { filter = k; renderCustomers(); } }, `${t} (${counts[k] || 0})`)));
  $('filter-hint').textContent = HINTS[filter] || '';
  const tagText = { lapsed: 'לא חזר/ה', near: 'קרוב/ה להטבה', ready: 'הטבה מוכנה', new: 'חדש/ה' };
  const rows = ms.filter(m => filter === 'all' || S.segment(m, biz.goal) === filter)
    .sort((a, b) => (b.lastVisit ? b.lastVisit.toMillis() : 0) - (a.lastVisit ? a.lastVisit.toMillis() : 0));
  if (!rows.length) return $('people').replaceChildren(el('div', { class: 'empty' }, ms.length ? 'אין לקוחות בקבוצה הזו כרגע 👌' : 'עוד אין לקוחות. תלו את הפוסטר ליד הקופה — ההצטרפות לוקחת 10 שניות.'));
  $('people').replaceChildren(...rows.map(m => {
    const seg = S.segment(m, biz.goal);
    const canMsg = m.consent && m.phone;
    return el('div', { class: 'person' },
      el('div', {}, el('span', { class: 'nm' }, m.name), tagText[seg] ? el('span', { class: 'tag ' + seg }, tagText[seg]) : '',
        el('div', { class: 'meta' }, `${m.stamps}/${biz.goal} · ביקור אחרון: ${ago(m.lastVisit)}` + (m.phone && !m.consent ? ' · לא אישר/ה הודעות' : ''))),
      el('div', { class: 'acts' }, canMsg ? el('a', { class: 'btn wa', href: S.waLink(m.phone, S.winBackText(m, biz)), target: '_blank', rel: 'noopener' }, 'וואטסאפ') : ''));
  }));
}

// ---------- Poster ----------
function renderPoster() {
  const url = joinUrl();
  $('join-link').value = url;
  $('poster').style.borderTopColor = biz.color;
  $('poster').replaceChildren(
    el('div', {}, el('div', { class: 'p-emoji' }, biz.emoji), el('h2', {}, biz.name)),
    el('div', { class: 'p-offer' }, `כל ביקור = חותמת. ${biz.goal} חותמות = ${biz.reward}`),
    qrSvg(url, 8),
    el('div', { class: 'p-steps' }, 'סורקים במצלמה ← כותבים שם ← זהו!', el('br'), 'בלי אפליקציה, בחינם'));
}
$('copy-link').onclick = async () => { try { await navigator.clipboard.writeText($('join-link').value); toast('הקישור הועתק'); } catch (e) { $('join-link').select(); } };
