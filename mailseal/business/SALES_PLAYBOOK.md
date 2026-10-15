# MailSeal sales playbook

Everything here is copy-paste. Replace `[brackets]`. **Every message is sent manually and personally by you, one person at a time.** Nothing is automated or bulk.

**Report link format:** `https://orikarasenti1-netizen.github.io/First-project/mailseal/?d=THEIRDOMAIN&lang=he`
(live once this branch is merged to `main`; see the README "Go live" steps). Open the link yourself before sending, to confirm the finding.

---

## 0. Positioning (one sentence)

**EN:** MailSeal stops criminals from sending email in your company's name. We set up SPF, DKIM and DMARC with you in one 30-minute session, without passwords, and roll it to full protection safely.
**HE:** ‏MailSeal מונע מעבריינים לשלוח מיילים בשם העסק שלך. אנחנו מגדירים איתך SPF,‏ DKIM ו-DMARC בפגישה אחת של 30 דקות, בלי סיסמאות, ומביאים את זה להגנה מלאה בצורה בטוחה.

**Who it's for:** small firms that send invoices or handle client payments by email: lawyers (real estate and commercial), accountants, bookkeepers, insurance agents, contractors and clinics.
**Proof to show:** their own report. Never a made-up statistic about them, and no testimonials until a real customer gives one.

---

## 1. Finding the first 20 prospects (≈10 min/day)

| Priority | Source | How | Expected reply rate* |
|---|---|---|---|
| 1 | **Your own network**: family, friends, former colleagues who own or work at a small business | List 15 names, then scan their domains in `prospects.html` | 30–60% |
| 2 | **Your dad's office and peers** (if "website for dad" is a law practice) | Scan his domain first. If it's exposed, fix it free or at cost; that becomes the first case study and the referral path into his network | high |
| 3 | **Web designers / IT freelancers** (Israeli Facebook groups for web designers, LinkedIn "בניית אתרים", d.co.il "בניית אתרים") | Scan 2–3 of *their clients'* sites (listed in their portfolios) and show them the gap | 10–25% |
| 4 | **Law and accounting firms** from d.co.il / Google Maps / the Bar Association directory | Open the firm's website, copy the domain, paste into `prospects.html`. Contact only firms that show **SPOOFABLE** | 5–15% |
| 5 | **Fiverr** (inbound, English) | Gig text in §7 | passive |

*\*These rates are assumptions to replace with your own numbers after the first 20 sends.*

**Daily target, days 2–10:** 5 personal sends plus follow-ups. Log every one in `PIPELINE.csv` (keep the filled-in copy **outside this public repo**, e.g. a private Google Sheet).

---

## 2. Warm network messages (WhatsApp/SMS to people you know; they know you, so this is personal, not advertising)

**HE**
> היי [שם], שאלה קצרה 🙂 אני מתחיל שירות קטן בתחום אבטחת מייל לעסקים. הרצתי בדיקה על הדומיין של [העסק] ויצא ש[ממצא, למשל "אין רשומת DMARC"], כלומר מישהו יכול לשלוח מייל שנראה כאילו הגיע מכם, למשל "עדכון פרטי בנק" ללקוחות.
> הדוח כאן: [קישור]
> אם בא לך, אני מתקן את זה איתך ב-30 דקות בשיתוף מסך. ללקוחות הראשונים זה ₪350 במקום ₪490. רלוונטי?

**EN**
> Hi [name], quick one 🙂 I'm starting a small email-security service and ran a check on [business]'s domain. It shows [finding, e.g. "no DMARC record"], so someone could send email that looks like it came from you, e.g. "updated bank details" to your clients.
> Report: [link]
> If you like, I'll fix it with you in a 30-minute screen-share. For the first few customers it's $99 instead of $149. Interested?

**Ask for referrals at the end of every warm conversation, including a "no":**
> תודה! מכיר עוד מישהו עם משרד/עסק קטן שכדאי שיבדוק את זה? הבדיקה חינם.

---

## 3. Partner messages (web designers / IT providers)

**HE (LinkedIn or Facebook DM, personal, one at a time)**
> היי [שם], ראיתי את האתרים שבנית ל[לקוח 1] ול[לקוח 2]. עבודה יפה.
> בדקתי (בדיקת DNS ציבורית) ושמתי לב שבשני הדומיינים אין DMARC, כלומר אפשר לשלוח מיילים מזויפים בשמם. לקוחות בדרך כלל מאשימים את מי שבנה את האתר כשזה קורה.
> אני מתקן את זה ללקוחות של בוני אתרים תחת המותג שלהם (או ישירות מולם), במחיר סיטונאי לדומיין. אשמח לשלוח לך את הדוח של אחד מהם כדי שתראה. מתאים?

**EN**
> Hi [name], I saw the sites you built for [client 1] and [client 2]. Nice work.
> A public DNS check shows neither domain has DMARC, so email can be forged in their name, and clients usually blame whoever "did the website" when that happens.
> I fix this for agencies' clients, white-label or direct, at a wholesale price per domain. Want me to send you one of the reports so you can see?

**Partner offer:** you send domains; we deliver; you invoice your client at whatever price you choose. Wholesale ₪290 (or $79) per domain; first domain free so they can see the process.

---

## 4. One-time, consent-first notes to firms you don't know

Use these only for firms that show **SPOOFABLE**. Generate each draft in `prospects.html`: it fills in the domain, the verified finding and the report link. **Send personally from your own mailbox or via the firm's website contact form, one at a time, and never twice.** See `LEGAL_AND_RISKS.md` §2 before using this channel in Israel.

The generated draft (HE) reads:
> שלום [שם], הרצתי בדיקה ציבורית על הגדרות המייל של [domain] ושמתי לב ש[ממצא]. בפועל זה אומר שמישהו יכול לשלוח מייל שנראה כאילו נשלח מכתובת @[domain]… הדוח המלא כאן: [קישור]. אם זה רלוונטי, אשמח לעבור איתך או עם איש ה-IT על התיקון, בערך חצי שעה. מעניין אותך? … (אם אינך מעוניין/ת לשמוע ממני, פשוט השב/י "לא" ולא אפנה שוב.)

It deliberately contains **no price and no hard sell**. It reports a verified fact and asks permission. Pricing comes only after they say yes.

**One follow-up only, 4 days later, same thread** (skip it if the legal check says no follow-ups):
> רק מוודא שזה הגיע. הממצא עדיין מופיע בבדיקה: [קישור]. אם זה לא בעדיפות, הכל טוב ולא אכתוב שוב.

---

## 5. After a "yes": conversion messages

**Price and booking (HE)**
> מעולה. ככה זה עובד:
> 1) פגישת שיתוף מסך של 30 דקות (Google Meet). אתה מחובר לחשבון הדומיין ולחשבון המייל, ואני מכוון. אני לא צריך סיסמאות.
> 2) במהלך 4 השבועות הבאים אני קורא את דוחות ה-DMARC ומעביר את המדיניות למצב חסימה בשני צעדים קצרים, בלי לפגוע במיילים האמיתיים שלכם.
> 3) בסוף מקבלים דוח לפני/אחרי. אם לא תגיעו לדירוג A תוך 30 יום, החזר מלא.
> מחיר לקוחות ראשונים: ₪350 (במקום ₪490). אפשר להעביר בהעברה בנקאית / ביט / PayPal, ואני שולח קבלה.
> מתי נוח לך השבוע? [2 אופציות זמן]

**EN**
> Great. Here's how it works: (1) a 30-minute Google Meet screen-share where you stay logged in and I guide you, no passwords; (2) over the next 4 weeks I read your DMARC reports and tighten the policy in two short steps without blocking your real mail; (3) you get a before/after report, and if you're not at grade A within 30 days, full refund. Founding price $99 (regular $149) via PayPal or bank transfer, with a receipt. Does [option 1] or [option 2] work?

**Payment timing:** for the first 3 customers, take payment **after** the session ("pay when you see it working"). That removes friction and costs you about 30 minutes at worst. From customer 4 on, take payment upfront.

---

## 6. Objection handling

| Objection | Answer |
|---|---|
| "Never happened to us." | "You'd usually never know: forged mail goes to *your clients*, not you. DMARC reports are how you find out. The free report shows the gap today." |
| "Our IT guy handles this." | "Great, send him the report link. If he fixes it, perfect. If he'd rather not touch DMARC rollout, I work with him." |
| "Will this break our email?" | "That's exactly why we stage it: monitor first, then quarantine, then reject, reading the reports in between." |
| "Too expensive." | "One forged invoice costs more than this. If price is the blocker, the free report has the exact records to do it yourself." |
| "I'm busy." | "It's 30 minutes once; the rest I handle. Pick any slot in the next two weeks." |
| "Is this a scam?" (it's a cold note about security, so this is fair) | "Reasonable to ask! Don't click anything: type your domain at [site] yourself, or ask your IT person to check your `_dmarc` record." |

---

## 7. Fiverr gig (English, inbound)

- **Title:** I will set up SPF, DKIM and DMARC to stop email spoofing, safely, to p=reject
- **Category:** Programming & Tech › Website Maintenance (or IT Support) › Email
- **Tags:** dmarc, spf, dkim, email deliverability, email spoofing
- **Description:**
  > Most domains can be impersonated: anyone can send email "from" you, and Gmail/Outlook increasingly junk unauthenticated mail.
  > I'm a security practitioner [confirm]. I'll:
  > ✔ audit your domain and every service that sends mail as you
  > ✔ give exact SPF, DKIM and DMARC records for your provider (Google Workspace, Microsoft 365, Zoho…)
  > ✔ stage DMARC safely from p=none to quarantine to reject, reading reports so legit mail keeps flowing
  > ✔ before/after report
  > **No passwords needed:** you apply the records (I guide you live or step-by-step), or share DNS access only if you prefer.
- **Packages:** Basic $49: audit plus exact records (DIY). Standard $99: plus a guided 30-min session and DKIM. Premium $179: plus a 4-week rollout to p=reject and two policy steps.
- **Gig image:** a screenshot of the MailSeal report for a demo domain (use `example.com`, never a real prospect).

---

## 8. Delivery script (30-minute session)

1. **(2 min)** Open their MailSeal report together. Confirm the email provider and DNS host.
2. **(5 min) Inventory senders:** "Who sends email as @you? Invoicing app, newsletter, CRM, website forms, scanner/copier?" Write the list down.
3. **(8 min) SPF:** in their DNS panel, edit or create the single SPF record from the report, adding includes for the other senders from step 2. Re-run the scan. It should pass.
4. **(8 min) DKIM:** in the Google Admin console or Microsoft Defender portal, generate and publish the key, then start signing (steps are in the report).
5. **(5 min) DMARC stage 1:** publish `p=none` with `rua=`. Use a free report service (Postmark DMARC digests, or Cloudflare DMARC Management if their DNS is on Cloudflare) so reports are readable.
6. **(2 min)** Re-scan, screenshot "before/after", and book two 5-minute follow-ups: **day 14** (quarantine) and **day 28** (reject).
7. Add the domain to the `MAILSEAL_CUSTOMERS` repo variable (see README) so the weekly monitor watches it.

**After the session, send this email:**
> Thanks [name]! Today we set up SPF, DKIM and DMARC (monitoring mode). Next: on [date] we move to quarantine, and on [date] to full protection (reject). Your updated report: [link]. Receipt attached.

**Day 28, ask for a testimonial (only if they're happy):**
> Glad it's done: [domain] is now grade [A]. Would you be OK with me quoting one sentence from you (first name + business type only, e.g. "Dana, real-estate lawyer")? And if you know anyone else who should check their domain, the free check is at [site].

---

## 9. Facebook/LinkedIn post (your own profile, not spam in groups; read each group's rules first)

**HE**
> בדקתי השבוע את הגדרות המייל של כמה עסקים קטנים שאני מכיר. ברובם [X מתוך Y, only after you have real numbers] חסרה רשומת DMARC, כלומר כל אחד יכול לשלוח מייל שנראה כאילו הגיע מהם, כולל "עדכון פרטי בנק" ללקוחות.
> בניתי בדיקה חינמית של 10 שניות, בלי הרשמה: [קישור]
> אם יוצא לכם אדום ולא בא לכם לגעת ב-DNS, אני מתקן את זה בשיחה של חצי שעה.

**Only publish real numbers you measured.**
