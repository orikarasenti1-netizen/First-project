# MailSeal: legal, tax and risk checklist

**This is not legal or tax advice.** Items marked ⚖️ need a professional to confirm (a lawyer or accountant; a one-off consultation is usually enough).

## 1. Before you take the first payment

- [ ] **Employment check** ⚖️: read your employment contract for moonlighting, conflict-of-interest, non-compete and IP-assignment clauses. This matters most if your employer is in security or email. If in doubt, ask for written approval. Never use employer time, devices, accounts, customer lists or non-public knowledge.
- [ ] **Register as עוסק פטור** (exempt dealer): free, online, with the Tax Authority, plus Bituach Leumi self-employed registration. You need it to issue receipts legally. ⚖️ Ask an accountant whether this is your best status, and how side income interacts with salaried income tax brackets.
- [ ] **Receipts:** issue a קבלה for every payment (accountant-approved apps or the Tax Authority's options). No VAT as עוסק פטור, up to the annual threshold (check the current ceiling).
- [ ] **Payment method:** bank transfer (0 fees), Bit/PayBox (check business-use terms), or PayPal (works for Israeli accounts; check receiving fees). **Stripe availability for Israeli individuals is unverified, so don't plan around it.**
- [ ] **Short written terms** (send by email before the session): scope (records + session + 2 policy steps); the customer applies changes in their own accounts; refund guarantee conditions (grade A within 30 days *if the agreed records are kept published*); liability limited to fees paid; no access to passwords.

## 2. Outreach rules (Israel anti-spam law, Communications Law §30A) ⚖️

- The law generally requires **prior consent for advertising by email, SMS, fax or automated calls**. Statutory damages can reach **₪1,000 per message without proof of damage**. ([Meitar summary](https://meitar.com/wp-content/uploads/2021/08/83-israeli_anti-spam_law.pdf), [Hunton](https://www.hunton.com/privacy-and-cybersecurity-law-blog/new-anti-spam-law-takes-effect-in-israel))
- There is an exception allowing a **one-time message to a business asking whether it agrees to receive advertising**. Our cold note (playbook §4) is built around that pattern: informational, no price, asks permission, opt-out. **Whether a specific wording qualifies is a legal question; have a lawyer review the Hebrew template once before using it.**
- **Safest channels, in order:** people you know → partners who opt in → inbound (site, Fiverr) → one-time consent requests.
- Never: bulk sending, purchased lists, scraped personal emails, automated LinkedIn tools, or a second message after a "no".
- If sending advertising to people who *did* consent: the subject must include the word "פרסומת", and the message must give the sender's details and an easy opt-out.
- Outside Israel (US): CAN-SPAM applies to commercial email (accurate headers, physical address, opt-out). Not needed for warm or inbound.

## 3. Privacy

- The scanner reads only public DNS and stores nothing. Order requests travel through the visitor's own email app.
- Keep the prospect/customer pipeline **private** (a Google Sheet, *not* this public repo). Keep only what's needed and delete prospects who say no. ⚖️ Israel's Privacy Protection Law (including Amendment 13) applies to databases of personal data. A small B2B contact list is low risk, but keep it minimal.
- **Never publish scan results for named third parties**: not in the repo, not in posts. The public CI only scans large public domains; the customer monitor masks domains in logs.

## 4. Operational risks

| Risk | Impact | Mitigation |
|---|---|---|
| A customer's legitimate mail is blocked after `p=reject` | High (angry customer, refund) | Never skip the staged rollout; check reports at each step; the customer can revert in one DNS edit |
| Wrong provider-specific SPF include | Medium | Includes are limited to well-documented providers; always re-scan live in the session |
| AI or tool errors in the report | Low/medium | The engine is deterministic (no AI) and covered by 14 unit + 26 end-to-end tests; you review every fix before a session |
| DoH provider outage | Low | Two providers (Cloudflare, then Google); a clear error message |
| GitHub Pages/Actions dependency | Low | Static files; can move to any static host (Netlify/Cloudflare Pages free) in minutes |
| Name "MailSeal" conflicts with an existing trademark | Low/medium | ⚖️ Search before buying a domain or printing anything; renaming means editing `config.js` and the titles |
| Support burden | Low | FAQ covers the main questions; Watch alerts arrive by email from GitHub |
