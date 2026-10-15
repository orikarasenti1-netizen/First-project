// Security-rule tests against the Firestore emulator.
// Run: cd chozrim && npm run test:rules
import test, { before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join as pjoin } from 'node:path';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const here = dirname(fileURLToPath(import.meta.url));
const ts = () => firebase.firestore.FieldValue.serverTimestamp();
const T = firebase.firestore.Timestamp;
let env;

const card = (uid, extra = {}) => ({ ownerUid: uid, name: 'Café Noa', reward: 'קפה חינם', goal: 10, color: '#B4532A', emoji: '☕', whatsapp: '972501234567', createdAt: ts(), ...extra });
const member = (code = '1234', extra = {}) => ({ name: 'Dana', phone: '0501234567', consent: true, code, stamps: 0, totalStamps: 0, rewards: 0, joinedAt: ts(), lastVisit: null, ...extra });

async function seedBusiness(id, data) {
  await env.withSecurityRulesDisabled(async ctx => { await ctx.firestore().doc('businesses/' + id).set(data); });
}
async function seedMember(b, m, data) {
  await env.withSecurityRulesDisabled(async ctx => { await ctx.firestore().doc(`businesses/${b}/members/${m}`).set(data); });
}
function join(db, b, memberId, code, data) {
  const batch = db.batch();
  batch.set(db.doc(`businesses/${b}/members/${memberId}`), data || member(code));
  batch.set(db.doc(`businesses/${b}/codes/${code}`), { memberId });
  return batch.commit();
}
const days = n => T.fromMillis(Date.now() + n * 864e5);

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-chozrim',
    firestore: { rules: readFileSync(pjoin(here, '../firebase/firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 }
  });
});
beforeEach(async () => { await env.clearFirestore(); });
after(async () => { await env.cleanup(); });

test('owner creates a business; cannot grant themselves payment or impersonate another owner', async () => {
  const alice = env.authenticatedContext('alice').firestore();
  await assertSucceeds(alice.collection('businesses').add(card('alice')));
  await assertFails(alice.collection('businesses').add(card('alice', { paidUntil: days(365) })));
  await assertFails(alice.collection('businesses').add(card('bob')));
  await assertFails(alice.collection('businesses').add(card('alice', { goal: 50 })));
  await assertFails(alice.collection('businesses').add(card('alice', { color: 'red' })));
  await assertFails(env.unauthenticatedContext().firestore().collection('businesses').add(card('alice')));
});

test('business cards are readable by id, but nobody can enumerate other businesses', async () => {
  await seedBusiness('b1', card('alice', { createdAt: T.now() }));
  await seedBusiness('b2', card('bob', { createdAt: T.now() }));
  const anon = env.unauthenticatedContext().firestore();
  await assertSucceeds(anon.doc('businesses/b1').get());
  await assertFails(anon.collection('businesses').get());
  const alice = env.authenticatedContext('alice').firestore();
  await assertFails(alice.collection('businesses').get());
  const mine = await assertSucceeds(alice.collection('businesses').where('ownerUid', '==', 'alice').get());
  if (mine.size !== 1) throw new Error('expected exactly one own business, got ' + mine.size);
});

test('owner cannot change billing fields; others cannot edit the card', async () => {
  await seedBusiness('b1', card('alice', { createdAt: T.now() }));
  const alice = env.authenticatedContext('alice').firestore();
  await assertSucceeds(alice.doc('businesses/b1').update({ reward: 'מאפה חינם' }));
  await assertFails(alice.doc('businesses/b1').update({ paidUntil: days(300) }));
  await assertFails(alice.doc('businesses/b1').update({ ownerUid: 'mallory' }));
  await assertFails(env.authenticatedContext('bob').firestore().doc('businesses/b1').update({ reward: 'x' }));
});

test('a customer joins with a fresh card and a unique code; codes cannot be stolen', async () => {
  await seedBusiness('b1', card('alice', { createdAt: T.now() }));
  const anon = env.unauthenticatedContext().firestore();
  await assertSucceeds(join(anon, 'b1', 'm_aaaaaaaaaaaaaaaaaaaa', '1234'));
  await assertFails(join(anon, 'b1', 'm_bbbbbbbbbbbbbbbbbbbb', '1234'));        // code taken -> whole batch fails
  await assertSucceeds(join(anon, 'b1', 'm_bbbbbbbbbbbbbbbbbbbb', '5678'));
  await assertFails(join(anon, 'b1', 'm_cccccccccccccccccccc', '1111', member('1111', { stamps: 9 })));   // can't start with stamps
  await assertFails(join(anon, 'b1', 'm_dddddddddddddddddddd', '2222', member('3333')));                   // code mismatch
  await assertFails(join(anon, 'b1', 'm_eeeeeeeeeeeeeeeeeeee', 'abcd', member('abcd')));
  await assertFails(anon.doc('businesses/b1/codes/9999').set({ memberId: 'm_aaaaaaaaaaaaaaaaaaaa' }));    // no member in batch
});

test('a card is readable only by its link; member lists and codes are owner-only', async () => {
  await seedBusiness('b1', card('alice', { createdAt: T.now() }));
  const anon = env.unauthenticatedContext().firestore();
  await join(anon, 'b1', 'm_aaaaaaaaaaaaaaaaaaaa', '1234');
  await assertSucceeds(anon.doc('businesses/b1/members/m_aaaaaaaaaaaaaaaaaaaa').get());
  await assertFails(anon.collection('businesses/b1/members').get());
  await assertFails(anon.doc('businesses/b1/codes/1234').get());
  await assertFails(env.authenticatedContext('bob').firestore().collection('businesses/b1/members').get());
  const alice = env.authenticatedContext('alice').firestore();
  await assertSucceeds(alice.collection('businesses/b1/members').get());
  await assertSucceeds(alice.doc('businesses/b1/codes/1234').get());
});

test('only the owner can stamp; customers cannot add their own stamps', async () => {
  await seedBusiness('b1', card('alice', { createdAt: T.now() }));
  await seedMember('b1', 'm1', member('1234', { joinedAt: T.now() }));
  const anon = env.unauthenticatedContext().firestore();
  await assertFails(anon.doc('businesses/b1/members/m1').update({ stamps: 10, totalStamps: 10 }));
  await assertFails(env.authenticatedContext('bob').firestore().doc('businesses/b1/members/m1').update({ stamps: 1, totalStamps: 1 }));
  const alice = env.authenticatedContext('alice').firestore();
  await assertSucceeds(alice.doc('businesses/b1/members/m1').update({ stamps: 1, totalStamps: 1, lastVisit: ts() }));
  await assertSucceeds(alice.doc('businesses/b1/events/e1').set({ type: 'stamp', memberId: 'm1', n: 1, at: ts() }));
  await assertFails(alice.doc('businesses/b1/members/m1').update({ totalStamps: 0 }));     // history can't shrink
  await assertFails(alice.doc('businesses/b1/members/m1').update({ code: '9999' }));
  await assertFails(anon.doc('businesses/b1/events/e2').set({ type: 'stamp', memberId: 'm1', n: 1, at: ts() }));
});

test('billing: after trial + grace, stamping and joining stop until paidUntil is set', async () => {
  await seedBusiness('old', card('alice', { createdAt: days(-40) }));
  await seedMember('old', 'm1', member('1234', { joinedAt: T.now() }));
  const alice = env.authenticatedContext('alice').firestore();
  const anon = env.unauthenticatedContext().firestore();
  await assertFails(alice.doc('businesses/old/members/m1').update({ stamps: 1, totalStamps: 1, lastVisit: ts() }));
  await assertFails(join(anon, 'old', 'm_zzzzzzzzzzzzzzzzzzzz', '4321'));
  await assertSucceeds(anon.doc('businesses/old/members/m1').get());                         // existing cards still visible
  await seedBusiness('old', card('alice', { createdAt: days(-40), paidUntil: days(30) }));    // operator marks as paid
  await assertSucceeds(alice.doc('businesses/old/members/m1').update({ stamps: 1, totalStamps: 1, lastVisit: ts() }));
  await assertSucceeds(join(anon, 'old', 'm_zzzzzzzzzzzzzzzzzzzz', '4321'));
  await seedBusiness('lapsed', card('alice', { createdAt: days(-90), paidUntil: days(-1) }));
  await seedMember('lapsed', 'm1', member('1234', { joinedAt: T.now() }));
  await assertFails(alice.doc('businesses/lapsed/members/m1').update({ stamps: 1, totalStamps: 1, lastVisit: ts() }));
});
