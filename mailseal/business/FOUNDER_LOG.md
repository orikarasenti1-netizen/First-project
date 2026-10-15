# Founder log

## Day 1: 2026-10-15

**Completed (verifiable in this branch / CI):**
- Researched and scored 11 opportunities and selected MailSeal (`DECISION_REPORT.md`).
- Built the scanner engine (`checker.js`): SPF incl. recursive lookup count, DMARC incl. inheritance, DKIM probing, MTA-STS/TLS-RPT, provider detection for 10 providers, exact fix records.
- Built the public page (EN/HE, RTL, mobile, PDF report, shareable `?d=` links, order flow) and the internal prospect tool with consent-first drafts.
- Tests: 14 unit tests and 26 end-to-end browser checks pass locally. CI run #1 passed, including a **live DNS smoke test** where system DNS and DNS-over-HTTPS gave identical results for google.com, microsoft.com, github.com and example.com.
- Calibration fix after the live test: DKIM on unknown selectors now gets partial credit, so big senders with custom selectors aren't graded unfairly low.
- Wrote the sales playbook, financials, legal checklist, operator manual and weekly monitor.

**Evidence collected:** willingness to pay exists in the market (Fiverr gigs at $50–$200; SaaS at ~$36/mo). No evidence yet about Israeli SMB buyers specifically. That is this week's test.

**Prospects identified / contacted / replied:** 0 / 0 / 0. This container cannot resolve DNS, so prospect scans must run in your browser (`prospects.html`) or in CI. Third-party scans are deliberately not run in public CI.
**Demos / commitments / payments:** 0 / 0 / ₪0.
**Spend:** ₪0. Ongoing: ₪0/month.

**Biggest blocker:** the site isn't public until the PR is merged and `contactEmail` is set (≈5 minutes, yours).

**Next three highest-impact actions:**
1. You: merge, set `contactEmail`, and scan 15 warm-network domains, starting with your dad's office if it fits.
2. You: send 5 warm messages (playbook §2) and 3 partner messages (§3).
3. Me (next session): adjust copy and offer from the first replies; add any provider the first scans reveal.

**Is the strategy still supported by evidence?** Yes, at the desk-research level. The real test is the day-7 kill criteria.
