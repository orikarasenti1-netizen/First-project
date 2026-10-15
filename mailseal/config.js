/*
 * MailSeal configuration — the ONLY file you need to edit to go live.
 *
 * contactEmail: where order requests are sent (opens the visitor's email app).
 *               Use a dedicated business address, not a personal one, if you can.
 * paypalMe:     optional PayPal.me username, used in payment-link text you send to customers.
 * calendarUrl:  optional booking link (e.g. a free Google Calendar appointment schedule).
 * foundingSpotsLeft: decrement by hand as founding customers sign up; set 0 to hide the offer.
 */
window.MAILSEAL_CONFIG = {
  brand: 'MailSeal',
  contactEmail: '',
  paypalMe: '',
  calendarUrl: '',
  foundingSpotsLeft: 5,
  prices: {
    fix:      { usd: 149, ils: 490 },
    founding: { usd: 99,  ils: 350 },
    watch:    { usd: 19,  ils: 69 }
  }
};
