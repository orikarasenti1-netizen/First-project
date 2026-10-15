// Chozrim data layer (Firestore). Used by the business app and the customer card.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, connectAuthEmulator, onAuthStateChanged, GoogleAuthProvider, signInWithPopup,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, collection, query, where, addDoc, updateDoc,
  writeBatch, runTransaction, onSnapshot, serverTimestamp, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const CFG = window.CHOZRIM_CONFIG || {};
const local = ['localhost', '127.0.0.1'].includes(location.hostname);
export const usingEmulator = local && new URLSearchParams(location.search).get('live') !== '1';
export const configured = usingEmulator || !!(CFG.firebase && CFG.firebase.apiKey && CFG.firebase.projectId);

let app, auth, db;
if (configured) {
  app = initializeApp(usingEmulator ? { apiKey: 'demo-key', projectId: 'demo-chozrim', authDomain: 'demo-chozrim.firebaseapp.com' } : CFG.firebase);
  auth = getAuth(app);
  db = getFirestore(app);
  if (usingEmulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
}

const DAY = 864e5;
export const LAPSED_DAYS = 21;

// ---------- Auth (business owners only; customers never sign in) ----------
export const onUser = cb => onAuthStateChanged(auth, cb);
export const signInGoogle = () => signInWithPopup(auth, new GoogleAuthProvider());
export const signInEmail = (email, pw) => signInWithEmailAndPassword(auth, email, pw);
export const signUpEmail = (email, pw) => createUserWithEmailAndPassword(auth, email, pw);
export const resetPassword = email => sendPasswordResetEmail(auth, email);
export const logOut = () => signOut(auth);

// ---------- Businesses ----------
export function cleanCard(d) {
  return {
    name: String(d.name || '').trim().slice(0, 40),
    reward: String(d.reward || '').trim().slice(0, 60),
    goal: Math.min(20, Math.max(3, parseInt(d.goal, 10) || 10)),
    color: /^#[0-9a-f]{6}$/i.test(d.color) ? d.color : '#FF5A36',
    emoji: String(d.emoji || '☕').slice(0, 8),
    whatsapp: toIntlPhone(d.whatsapp || '')
  };
}

export async function createBusiness(uid, data) {
  const ref = await addDoc(collection(db, 'businesses'), { ...cleanCard(data), ownerUid: uid, createdAt: serverTimestamp() });
  return ref.id;
}
export const updateBusiness = (id, data) => updateDoc(doc(db, 'businesses', id), cleanCard(data));

export async function myBusinesses(uid) {
  const snap = await getDocs(query(collection(db, 'businesses'), where('ownerUid', '==', uid)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getBusiness(id) {
  const s = await getDoc(doc(db, 'businesses', id));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}

// Mirrors isActive() in firestore.rules: 30-day trial + 7-day grace, or paid.
export function billing(b, now = Date.now()) {
  const trialDays = (CFG.operator && CFG.operator.trialDays) || 30;
  const created = b.createdAt ? b.createdAt.toMillis() : now;
  const paidUntil = b.paidUntil ? b.paidUntil.toMillis() : 0;
  const trialEnd = created + trialDays * DAY;
  const hardEnd = created + 37 * DAY;
  if (paidUntil > now) return { state: 'paid', active: true, until: paidUntil, daysLeft: Math.ceil((paidUntil - now) / DAY) };
  if (now < trialEnd) return { state: 'trial', active: true, until: trialEnd, daysLeft: Math.ceil((trialEnd - now) / DAY) };
  if (now < hardEnd) return { state: 'grace', active: true, until: hardEnd, daysLeft: Math.ceil((hardEnd - now) / DAY) };
  return { state: 'expired', active: false, until: hardEnd, daysLeft: 0 };
}

// ---------- Customers ----------
export async function joinCard(bizId, { name, phone, consent }) {
  const data = {
    name: String(name || '').trim().slice(0, 40),
    phone: String(phone || '').replace(/[^0-9+]/g, '').slice(0, 16),
    consent: !!consent,
    stamps: 0, totalStamps: 0, rewards: 0, lastVisit: null
  };
  if (!data.name) throw Object.assign(new Error('name required'), { code: 'invalid' });
  let lastErr;
  // A random 4-digit code; the batch fails atomically if the code is taken, so retry with another.
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = String(1000 + Math.floor(Math.random() * 9000));
    const mref = doc(collection(db, 'businesses', bizId, 'members'));
    const batch = writeBatch(db);
    batch.set(mref, { ...data, code, joinedAt: serverTimestamp() });
    batch.set(doc(db, 'businesses', bizId, 'codes', code), { memberId: mref.id });
    try { await batch.commit(); return { memberId: mref.id, code }; }
    catch (e) { lastErr = e; if (e.code !== 'permission-denied') throw e; }
  }
  throw lastErr;
}

export function watchMember(bizId, memberId, cb, onErr) {
  return onSnapshot(doc(db, 'businesses', bizId, 'members', memberId),
    s => cb(s.exists() ? { id: s.id, ...s.data() } : null), onErr);
}

export async function findByCode(bizId, code) {
  const c = await getDoc(doc(db, 'businesses', bizId, 'codes', String(code)));
  if (!c.exists()) return null;
  const m = await getDoc(doc(db, 'businesses', bizId, 'members', c.data().memberId));
  return m.exists() ? { id: m.id, ...m.data() } : null;
}

export async function listMembers(bizId) {
  const snap = await getDocs(collection(db, 'businesses', bizId, 'members'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addStamps(bizId, memberId, n = 1) {
  return runTransaction(db, async tx => {
    const ref = doc(db, 'businesses', bizId, 'members', memberId);
    const s = await tx.get(ref);
    if (!s.exists()) throw Object.assign(new Error('member not found'), { code: 'not-found' });
    const m = s.data();
    tx.update(ref, { stamps: m.stamps + n, totalStamps: m.totalStamps + n, lastVisit: serverTimestamp() });
    tx.set(doc(collection(db, 'businesses', bizId, 'events')), { type: 'stamp', memberId, n, at: serverTimestamp() });
    return { ...m, stamps: m.stamps + n, totalStamps: m.totalStamps + n };
  });
}

export async function redeem(bizId, memberId, goal) {
  return runTransaction(db, async tx => {
    const ref = doc(db, 'businesses', bizId, 'members', memberId);
    const s = await tx.get(ref);
    const m = s.data();
    if (m.stamps < goal) throw Object.assign(new Error('not enough stamps'), { code: 'not-ready' });
    tx.update(ref, { stamps: m.stamps - goal, rewards: m.rewards + 1, lastVisit: serverTimestamp() });
    tx.set(doc(collection(db, 'businesses', bizId, 'events')), { type: 'redeem', memberId, n: goal, at: serverTimestamp() });
    return { ...m, stamps: m.stamps - goal, rewards: m.rewards + 1 };
  });
}

export async function recentEvents(bizId, days = 7) {
  const since = Timestamp.fromMillis(Date.now() - days * DAY);
  const snap = await getDocs(query(collection(db, 'businesses', bizId, 'events'), where('at', '>=', since)));
  return snap.docs.map(d => d.data());
}

// ---------- Pure helpers (also used in tests) ----------
export function toIntlPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '972' + d.slice(1);      // Israeli local format 05x… -> 9725x…
  return d.slice(0, 15);
}

export function stats(members, events, now = Date.now()) {
  const week = now - 7 * DAY;
  const lapsedBefore = now - LAPSED_DAYS * DAY;
  const ms = v => (v && v.toMillis ? v.toMillis() : 0);
  return {
    members: members.length,
    newThisWeek: members.filter(m => ms(m.joinedAt) >= week).length,
    visitsThisWeek: events.filter(e => e.type === 'stamp').length,
    rewardsThisWeek: events.filter(e => e.type === 'redeem').length,
    returning: members.filter(m => m.totalStamps >= 2).length,
    lapsed: members.filter(m => m.lastVisit && ms(m.lastVisit) < lapsedBefore).length
  };
}

export function segment(m, goal, now = Date.now()) {
  const last = m.lastVisit && m.lastVisit.toMillis ? m.lastVisit.toMillis() : 0;
  if (m.stamps >= goal) return 'ready';
  if (last && last < now - LAPSED_DAYS * DAY) return 'lapsed';
  if (goal - m.stamps <= 2 && m.stamps > 0) return 'near';
  if (!last) return 'new';
  return 'active';
}

export function winBackText(m, b) {
  const left = Math.max(0, b.goal - m.stamps);
  const first = (m.name || '').split(' ')[0];
  if (m.stamps >= b.goal) return `היי ${first}! ב${b.name} מחכה לך ${b.reward} 🎁 — כבר צברת את כל החותמות. מתי קופצים? ${b.emoji}`;
  if (m.stamps > 0) return `היי ${first}! מתגעגעים אליך ב${b.name} ${b.emoji} יש לך כבר ${m.stamps} מתוך ${b.goal} חותמות — עוד ${left} ו${b.reward} עלינו. מחכים לך!`;
  return `היי ${first}! תודה שהצטרפת לכרטיסייה של ${b.name} ${b.emoji} — בכל ביקור חותמת, ובחותמת ה-${b.goal} ${b.reward} עלינו. מחכים לך!`;
}

export function waLink(phone, text) {
  const p = toIntlPhone(phone);
  return 'https://wa.me/' + p + '?text=' + encodeURIComponent(text);
}
