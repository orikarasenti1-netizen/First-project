# MailSeal: initial decision report

*Day 1, 2026-10-15. Each fact below is marked **[verified]** (with a source) or **[assumption]** (still to test).*

## 1. Selected opportunity

**MailSeal: a productized "stop email impersonation" service with a free self-serve scanner.**
We find and fix missing or broken SPF, DKIM and DMARC records. Those records decide whether a criminal can send email *as* a business ("new bank details" invoice fraud) and whether Gmail and Outlook trust the business's real mail. After the fix, customers can pay monthly for monitoring.

## 2. Customer and painful problem

- **Beachhead segment:** small Israeli professional firms (2–30 people) that move client money or invoices. Examples: real-estate and commercial lawyers, accountants and bookkeepers, insurance agents. They use their own domain on Google Workspace or Microsoft 365. The buyer is the partner/owner, or their outside IT person or web designer.
- **Pain:** a forged email from their own domain can redirect a client's payment. The owner can't fix it alone (DNS plus admin-console work, and a risky rollout). Their emails may also land in spam.
- **Secondary segments:** (a) web designers and IT freelancers who manage dozens of SMB domains (partner/wholesale channel); (b) global buyers already searching Fiverr for "SPF DKIM DMARC setup."

## 3. Why this can produce revenue within 14 days

- **The problem can be proven per prospect in 10 seconds.** DNS is public, so every message can name the exact gap ("yourfirm.co.il has no DMARC record") with a link to the prospect's own report. That is far stronger than a generic pitch.
- **People already pay for this [verified].** Fiverr has many active gigs for this exact job at roughly $50–$200, many delivered in a day ([Fiverr listings](https://fiverr.com/syedwarsi851/setup-spf-dkim-dmarc-and-mx-records), [another](https://www.fiverr.com/procrownstudio/set-up-google-workspace-gmail-mx-spf-dkim-and-dmarc)). Upwork guidance prices it at $40–$70/h ([aiproposer](https://aiproposer.com/templates/upwork-email-deliverability-proposal)).
- **Delivery is short and mostly automated:** a 30-minute screen-share, plus two 5-minute policy steps over 4 weeks.
- **$0 to launch.** Static site on your existing GitHub Pages, browser DNS-over-HTTPS, free monitoring in GitHub Actions.
- **It fits a security background [assumption: please confirm]**, which makes the offer credible to cautious buyers.

## 4. Evidence of demand and competitors

| Signal | Status |
|---|---|
| Large share of domains lack DMARC: 52% of top/Inc. 5000/Fortune 500 domains (EasyDMARC 2025); 84% of 73M domains (Red Sift, Dec 2025); 42% of domains seen by ISOC Pulse (Aug 2026) | [verified] via [EasyDMARC](https://easydmarc.com/blog/92-of-top-email-domains-remain-unprotected-against-phishing/), [ISOC Pulse](https://pulse.internetsociety.org/en/blog/what-99300-domains-reveal-about-email-authentication-and-dns-resilience/) |
| BEC losses of $2.77B in 2024 (FBI IC3) | [verified], secondary coverage: [Nacha](https://www.nacha.org/news/fbis-ic3-finds-almost-85-billion-lost-business-email-compromise-last-three-years), [Proofpoint](https://www.proofpoint.com/us/blog/email-and-cloud-threats/email-attacks-drive-record-cybercrime-losses-2024) |
| Gmail/Yahoo sender rules since 2024; Outlook enforcing on high-volume senders since May 5, 2025 | [verified] via [Microsoft](https://techcommunity.microsoft.com/blog/outlook/strengthening-email-ecosystem-outlook%E2%80%99s-new-requirements-for-high%E2%80%90volume-senders/4399730), [Red Sift guide](https://redsift.com/guides/bulk-email-sender-requirements) |
| SaaS competitors: EasyDMARC (Plus ≈ $36/mo, DIY), dmarcian, Valimail, PowerDMARC | [verified] via [Palisade comparison](https://www.palisade.email/learning/easydmarc-vs-dmarcian) |
| Freelancer competitors on Fiverr ($50–$200), mostly English, often ask for DNS/registrar logins | [verified] (listings above) |
| Israeli SMB DMARC adoption specifically | **[unknown]**: the first prospect scan will measure it |
| Israeli owners will pay ₪350–₪490 for this | **[assumption]**: this is what days 1–7 test |

**Gaps we exploit:** SaaS tools assume the customer can operate DNS and read DMARC XML; small firms can't. Fiverr sellers mostly set `p=none` and leave, which gives no real protection. They also usually want your passwords. MailSeal is **done-with-you, password-free, Hebrew-first, and finishes at full enforcement (`p=reject`) with proof.**

## 5. Product and differentiation

- **Free scanner** (`/mailseal/`): grade, a plain-language verdict, exact copy-paste records for the visitor's provider, and a PDF report. Bilingual EN/HE, with shareable `?d=domain` links.
- **Fix** (one-time): a 30-minute session, an inventory of every service that sends mail as them, a 4-week staged rollout to `p=reject`, and a before/after report. Guarantee: grade A within 30 days or a full refund.
- **Fix + Watch** (monthly): weekly automated re-scan, alerts, and a monthly DMARC summary.
- **Partner**: wholesale price per domain for web designers and IT providers.

## 6. Pricing and revenue model

| Plan | Israel | International | Notes |
|---|---|---|---|
| Fix: founding price, first 5 customers | ₪350 | $99 | Buys speed and a testimonial |
| Fix: regular | ₪490 | $149 | Middle of the Fiverr range, with more included |
| Watch | ₪69/mo | $19/mo | Justified by recurring breakage: new email tools silently break SPF |
| Partner | ~₪290/domain | $79/domain | Set per partner |

## 7. Costs

- **Startup:** $0. Already in place: GitHub Pages, browser DoH, Gmail, free Google Meet, PayPal or bank transfer for payment.
- **Monthly fixed:** $0.
- **Optional, needs your approval:** a domain such as `mailseal.co.il` (≈ ₪60–100/yr). Not needed to start; the GitHub Pages URL works.
- **Variable:** card/PayPal fees of about 4–5% when used; Fiverr takes 20% on that channel.

## 8. First customer acquisition strategy (in order)

1. **Warm network (days 1–3):** you, your family (if the "website for dad" in the repo means a law practice, that office and its peers come first), and friends who own businesses. Scan their domains first and send them their own report.
2. **Partners (days 2–7):** 10 Israeli web designers or IT freelancers. One yes gives access to many domains.
3. **Consent-first, one-to-one notes (days 3–10):** to law and accounting firms found on public directories. Each note is informational, names the verified gap, asks permission, and includes an opt-out. No bulk sending (see the legal notes).
4. **Fiverr gig (day 2, inbound in the background):** an English gig for global buyers already searching. Fiverr handles payment.

## 9. Biggest risks and mitigations

| Risk | Mitigation |
|---|---|
| Israeli anti-spam law (§30A): heavy statutory damages per message | Warm and partner channels first; cold notes only as one-time, personal, consent-seeking messages with opt-out; have a lawyer confirm the wording. See `LEGAL_AND_RISKS.md`. |
| Your employment agreement (moonlighting/conflict, especially at a security employer) | **Check before any sale.** No employer time, devices or data. |
| A DNS change breaks a customer's email | The customer makes the change in a live session; DMARC is staged; nothing goes to `reject` without report review; scope is written down. |
| "We'll do it ourselves with the free report" | Fine. The free report is the marketing. Paying customers buy the safe rollout and someone accountable. |
| Low urgency ("never happened to us") | Lead with *their* domain and the forged-invoice scenario, and use deliverability as a second hook. Kill criteria below. |
| Can't legally invoice yet | Open an *osek patur* online (free, about a day) before the first payment. |

## 10. Kill / pivot criteria (set before outreach)

- **By day 7:** at least 25 people reached (warm + partners + notes), at least 5 replies, at least 2 calls booked.
- **By day 14:** at least 1 paid customer, or at least 2 written "yes, send the payment link."
- **If replies come in but nobody buys:** price or urgency is wrong. Test a ₪190 "we-guide-you" tier, and lead with deliverability instead of fraud.
- **If there are no replies at all:** the segment or channel is wrong. Switch to web designers/IT and Fiverr (cold-email agencies buy this setup often).
- **Spend cap:** ₪0 without your explicit approval.

## Opportunity scoring (weights favour speed to cash, distribution and low founder time)

Weights: first-payment-in-14-days probability 20, pain 10, willingness-to-pay evidence 10, reach speed/cost 12, competition and differentiation 6, feasibility 8, upfront cost 5, founder time 10, margin 5, recurring potential 5, maintenance 4, legal/platform risk 5 (higher score = lower risk). Each criterion is scored 1–5 and the weighted total is scaled to 100.

| # | Opportunity | P(14d) | Pain | WTP | Reach | Comp | Feas | Cost | Time | Margin | Recur | Maint | Risk | **Score** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **MailSeal email-auth fix + monitoring** | 4 | 4 | 4 | 4 | 3 | 5 | 5 | 4 | 5 | 3 | 4 | 3 | **80** |
| 2 | Fiverr-only "cold-email domain setup" for outbound agencies | 3 | 4 | 5 | 3 | 2 | 5 | 5 | 4 | 4 | 2 | 4 | 4 | 74 |
| 3 | WordPress security/care plans for SMBs | 3 | 3 | 4 | 3 | 2 | 4 | 5 | 2 | 4 | 5 | 2 | 3 | 65 |
| 4 | Israeli website accessibility statement/audit (IS 5568) | 3 | 4 | 4 | 3 | 1 | 3 | 5 | 2 | 3 | 2 | 3 | 2 | 60 |
| 5 | Cyber-insurance questionnaire prep for SMBs | 2 | 3 | 3 | 2 | 4 | 4 | 5 | 3 | 5 | 2 | 4 | 3 | 60 |
| 6 | AI Google-review replies for local businesses | 3 | 2 | 3 | 3 | 1 | 4 | 4 | 4 | 4 | 4 | 3 | 3 | 62 |
| 7 | Privacy Law Amendment 13 compliance packs (Israel) | 2 | 4 | 4 | 2 | 2 | 2 | 5 | 2 | 4 | 2 | 3 | 1 | 53 |
| 8 | Folio invoicing SaaS (existing repo) | 1 | 2 | 2 | 2 | 1 | 5 | 5 | 4 | 5 | 4 | 3 | 4 | 54 |
| 9 | B2B lead-list building / enrichment | 3 | 3 | 4 | 3 | 1 | 4 | 4 | 2 | 4 | 3 | 3 | 2 | 60 |
| 10 | Uptime/SSL/domain-expiry monitoring for agencies | 2 | 2 | 3 | 3 | 1 | 5 | 5 | 5 | 5 | 5 | 4 | 4 | 67 |
| 11 | Law-firm AI intake / document summariser | 1 | 3 | 3 | 2 | 2 | 3 | 3 | 3 | 3 | 4 | 2 | 2 | 48 |

Why #1 beats #2: #2 is really a *channel* of #1 (same delivery, Fiverr distribution), so it's included as channel 4 rather than chosen alone. Why not #8: free invoice generators are everywhere, and nothing shows freelancers paying $12/mo for one, so I parked it. Your Folio/Proposal/Grain files are untouched.
