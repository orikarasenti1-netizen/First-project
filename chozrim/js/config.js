/*
 * Chozrim configuration — fill these in once (see chozrim/README.md, "Go live").
 *
 * firebase: paste the web-app config from Firebase console → Project settings → Your apps.
 *           These values are public by design; security comes from firestore.rules.
 * operator: how businesses pay you. Shown on the billing screen when a trial ends.
 */
window.CHOZRIM_CONFIG = {
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    appId: ''
  },
  operator: {
    whatsapp: '',          // your business WhatsApp, international format without +, e.g. 972501234567
    paymentLink: '',       // optional: PayPal.me / payment page link
    priceMonthly: 59,      // ₪ per month
    foundingPrice: 39,     // ₪ per month, locked for the first businesses
    trialDays: 30
  }
};
