// Customer card page: c.html?b=<businessId>[&m=<memberId>]
import { configured, getBusiness, billing, joinCard, watchMember } from './store.js';
import { el, punchCard, toast } from './ui.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const bizId = params.get('b');
const storeKey = 'chozrim:' + bizId;
let biz, lastStamps = null;

function show(id) { ['loading', 'msg', 'join', 'mycard'].forEach(x => { $(x).hidden = x !== id; }); }
function message(text, cls = 'notice') { $('msg').className = cls; $('msg').textContent = text; show('msg'); }
function remember(memberId) { try { localStorage.setItem(storeKey, memberId); } catch (e) { /* private mode */ } }
function recall() { try { return localStorage.getItem(storeKey); } catch (e) { return null; } }
function cardUrl(memberId) {
  const u = new URL(location.href);
  u.search = ''; u.searchParams.set('b', bizId); u.searchParams.set('m', memberId);
  ['live'].forEach(k => params.get(k) && u.searchParams.set(k, params.get(k)));
  return u.toString();
}

async function boot() {
  if (!configured) return message('המערכת עדיין לא הוגדרה.', 'notice bad');
  if (!bizId) return message('הקישור לא שלם. סרקו שוב את הקוד בעסק.', 'notice bad');
  try { biz = await getBusiness(bizId); } catch (e) { return message('אין חיבור כרגע. נסו לרענן בעוד רגע.', 'notice bad'); }
  if (!biz) return message('הכרטיסייה לא נמצאה. סרקו שוב את הקוד בעסק.', 'notice bad');
  document.documentElement.style.setProperty('--brand', biz.color);
  document.title = 'הכרטיסייה של ' + biz.name;
  $('consent-txt').textContent = `אשמח לקבל מ${biz.name} עדכונים והטבות בוואטסאפ (אפשר להפסיק בכל רגע)`;

  const memberId = params.get('m') || recall();
  if (memberId) return openCard(memberId);
  if (!billing(biz).active) return message(`ההצטרפות לכרטיסייה של ${biz.name} סגורה כרגע.`, 'notice');
  $('join-preview').replaceChildren(punchCard(biz, 0));
  show('join');
}

$('join-form').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, err = $('join-err');
  err.hidden = true;
  if (!f.name.value.trim()) { err.textContent = 'נא לכתוב שם'; err.hidden = false; f.name.focus(); return; }
  if (f.consent.checked && f.phone.value.replace(/\D/g, '').length < 9) { err.textContent = 'כדי לקבל עדכונים בוואטסאפ צריך מספר טלפון'; err.hidden = false; f.phone.focus(); return; }
  $('join-btn').disabled = true; $('join-btn').textContent = 'יוצר כרטיסייה…';
  try {
    const { memberId } = await joinCard(bizId, { name: f.name.value, phone: f.phone.value, consent: f.consent.checked });
    remember(memberId);
    history.replaceState(null, '', cardUrl(memberId));
    openCard(memberId, true);
  } catch (ex) {
    err.textContent = ex.code === 'permission-denied' ? 'לא הצלחנו ליצור כרטיסייה. בקשו מהעסק לבדוק שהכרטיסייה פעילה.' : 'משהו השתבש. בדקו חיבור ונסו שוב.';
    err.hidden = false;
  } finally { $('join-btn').disabled = false; $('join-btn').textContent = 'קבלו את הכרטיסייה'; }
});

function openCard(memberId, isNew) {
  remember(memberId);
  show('loading');
  watchMember(bizId, memberId, m => {
    if (!m) { try { localStorage.removeItem(storeKey); } catch (e) { /* ignore */ } return message('הכרטיסייה הזו לא נמצאה. אפשר להצטרף מחדש בסריקת הקוד בעסק.', 'notice bad'); }
    const popFrom = lastStamps != null && m.stamps > lastStamps ? lastStamps : null;
    if (popFrom != null) { toast('קיבלת חותמת! ' + biz.emoji); if (navigator.vibrate) navigator.vibrate(60); }
    if (lastStamps != null && m.stamps < lastStamps) toast('ההטבה מומשה — בתיאבון! 🎉', 3000);
    lastStamps = m.stamps;
    $('card-slot').replaceChildren(punchCard(biz, m.stamps, { popFrom }));
    $('code').textContent = m.code;
    const ready = m.stamps >= biz.goal;
    $('ready').hidden = !ready;
    $('ready').textContent = `🎉 ${biz.reward} מחכה לך! הראו את המסך הזה בקופה`;
    $('stats-line').textContent = !m.rewards ? '' : m.rewards === 1 ? 'כבר מימשת כאן הטבה אחת. כל הכבוד!' : `כבר מימשת כאן ${m.rewards} הטבות. כל הכבוד!`;
    show('mycard');
    if (isNew) { toast('ברוכים הבאים! זו הכרטיסייה שלך'); isNew = false; }
  }, () => message('אין חיבור כרגע. נסו לרענן בעוד רגע.', 'notice bad'));

  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  $('save-how').textContent = ios ? 'לחצו על כפתור השיתוף ⬆️ ואז "הוסף למסך הבית"' : 'בתפריט הדפדפן ⋮ בחרו "הוספה למסך הבית"';
  $('share-btn').onclick = async () => {
    const url = cardUrl(memberId);
    try {
      if (navigator.share) await navigator.share({ title: 'הכרטיסייה שלי ב' + biz.name, url });
      else { await navigator.clipboard.writeText(url); toast('הקישור הועתק — שמרו אותו אצלכם'); }
    } catch (e) { /* user cancelled */ }
  };
}

boot();
