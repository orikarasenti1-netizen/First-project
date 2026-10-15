# MailSeal: operator manual

A free email-impersonation checker (SPF / DKIM / DMARC) that sells a done-with-you fix and monthly monitoring.
Everything lives in this `mailseal/` folder. The rest of the site (Folio, Proposal, Grain, pricing, the home page) is untouched.

| File | What it is |
|---|---|
| `index.html` | Public page: scanner, report/PDF, offer, pricing, FAQ, order form (EN/HE) |
| `prospects.html` | Internal tool: bulk-scan prospect domains, CSV export, personalised consent-first drafts |
| `checker.js` | Scan engine (browser and Node) |
| `i18n.js` | All page copy in English and Hebrew |
| `config.js` | **The one file to edit:** contact email, prices, founding spots |
| `scripts/scan.mjs` | CLI scanner and weekly monitor |
| `../.github/workflows/mailseal.yml` | CI: tests, live DNS smoke test, weekly customer monitor |
| `business/` | Decision report, sales playbook, financials, legal checklist, pipeline template |

## Go live (≈15 minutes, once)

1. **Contact email**: in `config.js`, set `contactEmail` to a dedicated inbox (e.g. a new free Gmail for the business). It is published on the page, so don't use your personal address.
2. **Publish**: merge the MailSeal pull request into `main`. The existing `deploy.yml` publishes to GitHub Pages:
   `https://orikarasenti1-netizen.github.io/First-project/mailseal/`
   Test it: open `…/mailseal/?d=example.com`. You should get grade A, "Sealed".
3. **Monitor variable**: GitHub → repo **Settings → Secrets and variables → Actions → Variables → New repository variable**, named `MAILSEAL_CUSTOMERS`. Leave it as `none` until you have a customer, then use `firm.co.il:A,other.com:B` (domain:minimum grade). It's a variable, not a file, so customer names never appear in this public repo.
4. **Before the first payment**: do the employment check and the עוסק פטור registration (`business/LEGAL_AND_RISKS.md` §1).
5. **Fiverr (optional, 20 min)**: create the gig from `business/SALES_PLAYBOOK.md` §7.

## Daily routine (≤ 30 minutes)

1. **5 min:** read replies and order emails; answer with playbook §5–6 templates.
2. **15 min:** 5 new personal sends. Paste domains into `prospects.html`, click **Draft** on a SPOOFABLE row, open their report link yourself to confirm, then send manually.
3. **5 min:** follow-ups that are due (one per prospect, max).
4. **5 min:** update your private pipeline sheet and the counts in `business/FINANCIALS.md`.

## What runs without you, and what doesn't

| Automatic | Needs your approval | Needs your judgment |
|---|---|---|
| Scans, grading, exact fix records, PDF report | Any spending (domain, ads, tools) | The 30-min customer session |
| Personalised outreach drafts | Every outreach message (you send them) | DMARC tightening at day 14 and day 28 (read the reports first) |
| Weekly re-scan of customers; failure → GitHub emails you | Refunds | Unusual setups (custom mail servers, >10 SPF lookups) |
| CI tests on every change | Taking on a partner agency | |

**Escalation:** if a Monday monitor email arrives, open the run's summary. Customers are numbered in the order of `MAILSEAL_CUSTOMERS`. Open `…/mailseal/?d=<domain>`, see what broke (usually a new email tool added to SPF), and send the customer the fixed record within 1 business day.

## Testing

```bash
node --test mailseal/tests/checker.test.js     # 14 unit tests (mock DNS)
node mailseal/tests/e2e.mjs                    # 26 browser checks (needs Playwright + Chromium)
node mailseal/scripts/scan.mjs example.com     # live scan (needs DNS access)
node mailseal/scripts/scan.mjs --doh example.com
```

## How it works

The page queries public DNS over HTTPS (Cloudflare, falling back to Google) directly from the visitor's browser: MX, SPF (with the recursive 10-lookup count), DMARC (including organisational-domain inheritance), DKIM on 25 common selectors plus provider selectors, and MTA-STS/TLS-RPT. No server, no storage, no API keys. Scoring: SPF 30 + DMARC 40 + DKIM 30. A domain counts as "spoofable" unless DMARC is enforced (quarantine/reject at 100%).
