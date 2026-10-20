# DuMeGud — Product Requirements Document

**Version:** 1.2  
**Date:** 12 October 2026  
**Status:** Planning / MVP specification  
**Market:** Sierra Leone (initial launch)  

## 1. Product overview

**DuMeGud** (spelled **D-U-M-E-G-U-D**) is a creator-support and digital-commerce platform inspired by Buy Me a Coffee, adapted to Sierra Leone. The name draws on the local expression “do me good,” meaning “help me out” or “support me.”

Creators register at no upfront cost, receive a public shareable page, accept **one-off contributions** from supporters, and sell their own digital products through a simple storefront. Supporters should be able to pay from a browser without installing an app or creating an account. The platform earns a configurable percentage of eligible transactions.

### Core product promise

> Share your DuMeGud link, get support for your work, and sell digital creations — without requiring your audience to install an app.

### Key decisions to date

| Area | Decision |
|---|---|
| Brand | **DuMeGud** (exact spelling and capitalization); logo/wordmark direction under refinement |
| Launch region | Sierra Leone |
| Main experience | Mobile-friendly **web application first** |
| Native creator app | Not in MVP; reconsider if creator research justifies it |
| Support type | **One-off only** in MVP; no subscriptions or recurring billing |
| Commerce | Digital-product storefronts |
| Registration | Free for creators |
| Revenue | Platform transaction fee, configurable; final percentage TBD |
| Payments | **Monime** integration targeted for Orange Money and AfriMoney, subject to provider approval and capabilities |
| Payout / wallet architecture | **Undecided**; intentionally separate design and compliance workstream |
| Application | Single **Next.js** codebase, without a separate NestJS service for MVP |
| Database | **Neon-hosted PostgreSQL** |
| ORM | **Drizzle ORM** (preferred) |
| Authentication | **Better Auth** (preferred, to be validated during implementation) |
| File storage | **Cloudflare R2** private object storage |
| UI | Tailwind CSS; accessible responsive design; visual tokens defined in brand exploration |
| Risk controls | Creator verification, rules-based monitoring, configurable limits, admin review, audit trails |

## 1A. Brand identity and design system (updated 12 October 2026)

### Brand strategy

- **Name:** DuMeGud — exactly `DuMeGud`; preserve the capital **D**, **M**, and **G** in primary brand uses. The name evokes the Sierra Leonean expression “do me good.”
- **Brand character:** welcoming, generous, optimistic, distinctly local without limiting future African expansion, and trustworthy enough for a payment experience.
- **Working tagline:** **Support creators. Fuel good.** This is a proposed creative direction, not a legal or final brand commitment.
- **Visual goal:** modern, minimal, memorable, friendly but not childish. Avoid imitating Buy Me a Coffee’s coffee motif or the visual identity of other competitors.
- **Logo system:** (1) horizontal lockup with logomark and wordmark, (2) standalone logomark for favicon/social/app icon, (3) wordmark-only version, (4) one-color, reverse/white, and dark-background versions.

### Current creative exploration — not yet approved as final branding

The original blue-and-green direction was **not preferred**. Subsequent explorations tested:

| Direction | Primary | Secondary | Neutral | Intended impression |
|---|---|---|---|---|
| A — Coral/charcoal | `#FF7F63` | `#2E2E2E` | `#F8F1E7` | Warmth, approachability, clarity |
| B — Plum/apricot | `#4B1E3F` | `#F4A261` | `#C9BBAF` | Expressive creativity, culture, confidence |
| C — Charcoal/amber | `#2E2E2E` | warm amber (final HEX TBD) | soft off-white (final HEX TBD) | Trust, value, understated premium feel |

**Status:** none is confirmed. Do **not** hardcode a final primary color palette without stakeholder selection. For prototyping, use direction A as a temporary design-token set so it can be swapped centrally. Check text/background contrast in all states; accent colors alone must not carry key financial information.

### Wordmark and typography exploration

Recent designs explored three typography paths: **rounded geometric sans**, **humanist sans**, and **premium contemporary sans**. The font has **not been chosen**. The final treatment should:

- Keep the spelling legible as **DuMeGud**, with subtle optical spacing at the **Du / Me / Gud** transitions, rather than forced wide gaps that make it appear to be three separate products.
- Use strong letterform clarity and adjusted kerning; inspect at small mobile widths and as a header logo.
- Use negative space with purpose; avoid fine decoration, shadows, complex gradients, and overly literal hand/heart illustrations.
- Have a distinctive, scalable D-based icon concept, ideally suggesting support, uplift or creative momentum through negative space. This concept remains subject to visual testing and refinement.
- Keep logo typography separate from UI type decisions. UI typography should prioritize multilingual readability, performance, clear numerals, and accessible contrast.

### Design tokens and implementation guidance

- Define theme variables for primary, accent, surface, border, text, muted text, focus, success, warning, and danger. Financial states use consistent semantic colors independent of branding.
- Support light mode in MVP and ensure logo variants can render over both light and dark surfaces. Full dark mode can follow later.
- Use SVG vector assets for approved logos and optimized PNG/ICO variants for favicons and platform metadata.
- Establish clear-space rules, minimum sizes, monochrome tests, and accessible color pairs before locking the final assets.
- Treat all previously generated logo boards as **concepts**, not production-ready vector masters, trademark clearance, or exact finalized font specifications.

### Brand approval checklist

- [ ] Select one color direction and accessible color palette.
- [ ] Select/refine one wordmark type direction; confirm font licensing.
- [ ] Finalize distinct logomark and confirm it works at 16–32px.
- [ ] Produce final SVG horizontal, symbol-only, wordmark-only, monochrome, and reversed lockups.
- [ ] Confirm domain, usernames, and trademark availability through appropriate checks.

## 2. Problem and opportunity

Sierra Leonean creators may struggle to monetize audiences directly, particularly when established international creator platforms do not fit locally used payment methods. DuMeGud aims to remove friction between a creator sharing a link and a supporter making a one-off contribution or purchasing a digital item.

### Target creators

- Musicians, writers, artists, designers, photographers, educators, and other legitimate digital creators.
- Social-media creators seeking one-off audience support.
- Creators selling e-books, guides, music, templates, artwork, or other permitted downloadable files.

### Users

1. **Creator:** Publishes a profile, receives support, manages products, and reviews activity.
2. **Supporter / buyer:** Opens a public link, contributes once, or purchases and accesses a product.
3. **Platform staff / admin:** Manages users, listings, payments, trust and safety, disputes, and platform settings.

## 3. Goals and non-goals

### MVP goals

- Creator sign-up and onboarding are straightforward.
- Creators can share a memorable public profile URL.
- Supporters can contribute without registering.
- Creators can upload and sell eligible digital products.
- Buyers receive secure digital access after **verified successful payment**.
- Administrators can detect, review, and restrict suspicious activity.
- Payment status and product delivery are auditable and idempotent.
- Pages work well on low-bandwidth mobile connections.

### Not in MVP

- Recurring contributions, memberships, or subscription billing.
- Native iOS / Android apps.
- Physical goods, shipping, and marketplace logistics.
- Live streaming and social feeds.
- Advanced AI fraud models and enterprise DRM.
- A self-built payment processor.
- International cards or cross-border payments unless explicitly supported and approved.
- Promising that digital goods cannot be copied after purchase.

## 4. Core user journeys

### 4.1 Creator onboarding

1. Visit DuMeGud and choose **Create a page**.
2. Create an account and verify the required contact information.
3. Pick a unique handle (for example, `dumegud.com/creatorname`).
4. Add display name, bio, image, category, and optional verified social links.
5. Complete verification required for applicable features / thresholds.
6. Publish the creator page when eligibility checks pass.
7. Share the link on WhatsApp, TikTok, Instagram, Facebook, and elsewhere.

A creator can save an incomplete draft. The platform must not imply that payments or withdrawals are enabled before provider and compliance requirements are satisfied.

### 4.2 One-off support

1. Supporter opens a creator's public page using a browser.
2. Selects a suggested amount or enters a permitted custom amount.
3. Optionally adds a name and message; support anonymity where lawfully appropriate.
4. Reviews total, fees, and payment method.
5. Completes payment through the integrated provider.
6. Sees a confirmation **only after the payment is verified server-side**.
7. Creator sees the transaction and message in their dashboard, subject to moderation and risk controls.

No supporter account should be required for a basic contribution unless risk controls or payment-provider rules demand otherwise.

### 4.3 Digital product purchase

1. Buyer visits a creator page or a product share-link.
2. Sees product description, preview, supported format, price, and usage terms.
3. Purchases through supported payment methods.
4. System verifies payment success from trusted provider records/webhooks.
5. System grants a buyer-specific entitlement and provides a short-lived download link.
6. Buyer receives a receipt and an appropriate recovery path for access.

### 4.4 Creator management

Creators can update profiles, create/edit/unpublish products, view support and orders, inspect statuses and fees, and request assistance. Payout functionality depends on the later funds-flow decision.

## 5. Functional requirements

### 5.1 Public website and creator pages

- Landing page explaining DuMeGud's value proposition.
- Creator page: handle, avatar, bio, links, one-off support widget, and digital shop.
- Public profiles are shareable and mobile responsive.
- Support widgets offer configurable suggested amounts and a custom amount subject to limits.
- Clear error, pending-payment, success, and canceled-payment states.
- Terms of use, privacy, content policy, prohibited activities, and reporting links.
- SEO metadata and social sharing previews.

### 5.2 Accounts and roles

- Email/password or other explicitly approved sign-in methods supported through Better Auth.
- Role separation: **Creator**, **Staff / Compliance reviewer**, **Super Admin**; supporters may be guests.
- Verified contact information, secure sessions, password reset, account status flags.
- Sensitive admin operations require stronger authentication and access checks.
- Creator data and transaction views are scoped to the authenticated owner.

### 5.3 Digital storefront

- Product types: e-books/PDFs, music/audio files, visual assets, templates, and other approved digital downloads.
- Fields: title, description, category, preview media, uploaded asset, price, currency, license/usage terms, publication status.
- Validate MIME type, extension, size, virus/malware scan result, and policy eligibility.
- Product drafts and published states.
- Purchase confirmation, order history, entitlements, receipts, download access.
- Refund and dispute handling requirements defined in policy.
- Product takedown, suspension, and infringement reporting.

### 5.4 Transactions and payment integration

- Use Monime for locally supported payment collection, including Orange Money and AfriMoney **only where confirmed available for this use case**.
- Store external transaction reference, provider status, internal status, amount, currency, actor IDs where known, timestamps, applied fees, and reconciliation data.
- Verify webhook authenticity; prevent replay; make event processing idempotent.
- Never rely on a client redirect alone to mark a payment as settled.
- Reconcile provider events against internal orders/contributions.
- Handle pending, failed, canceled, reversed/refunded, and disputed states.
- Display fees before checkout if charged to the supporter and provide clear receipts.
- Do not store mobile-money PINs or other payment credentials.

**Unresolved:** Monime spaces/wallets, settlement ownership, holding balances, withdrawal mechanisms, reserve/hold logic, and payout timing are explicitly **not finalized** in this PRD. These require provider confirmation and legal/compliance review before enabling production transactions.

## 6. Anti-money-laundering, anti-fraud, and trust controls

This is a first-class requirement from MVP, not an optional later add-on. The design should use a risk-based approach and comply with applicable Sierra Leone law, regulator guidance, contractual provider obligations, and privacy requirements. The proposal below is **product design**, not a representation that specific thresholds meet legal requirements.

### 6.1 Creator identity and verification

- Collect the minimum necessary creator identity and contact details.
- Support staged verification: contact confirmation first, then government ID and additional checks when mandated by policy/provider or risk level.
- Where technically and legally feasible, validate identity information, mobile-money ownership, and name consistency.
- Screen required entities against applicable sanctions and restrictions through an approved process.
- Verify ownership of claimed social profiles when possible; a social link alone is not proof of legal identity.
- Support enhanced due diligence for higher-risk accounts or volume.
- Securely retain verification decisions and evidence subject to defined access and retention policies.

### 6.2 Configurable transaction and volume limits

**All limits are configured in the admin dashboard, never hardcoded.** The system should support:

- Maximum amount per individual contribution.
- Maximum contributions by a supporter to the same creator within rolling 24-hour, 7-day, and 30-day windows.
- Maximum total contributions from a supporter across all creators per window.
- Maximum total amount a creator can receive per day and over rolling 7-day / 30-day windows.
- Transaction count / velocity limits, including repeated low-value payments.
- Separate limits by verification tier, risk level, and payment rail where supported.
- Holds or freezes triggered by thresholds, subject to provider/legal authorization.

**Illustrative figures only:** Le500 per contribution, Le1,000 from one supporter to one creator per day, and Le2,000 in daily receipts per early-stage creator were discussed as examples. **These are not approved production limits.** The team must validate appropriate current-currency limits, economics, abuse patterns, operational capacity, and compliance expectations before launch.

### 6.3 Rule-based fraud monitoring

Flag accounts or activity when rules indicate possible abuse, such as:

- Rapid repeated contributions or patterns just below a threshold.
- Many payments from the same payer/device/instrument to one creator.
- Multiple accounts connected by overlapping identifiers where collection and use are lawful.
- Newly created creators receiving unusually high volumes.
- Rapid changes to identity, linked contact information, or payout details.
- Repeated payment failures, reversals, disputes, or chargebacks.
- Creator and supporter activity suggestive of self-funding, collusion, or circular transactions.
- Suspicious product listings, impersonation, stolen content, or misleading claims.

Rules create **review signals, not automatic allegations of wrongdoing**. Handle false positives and let reviewers document their decisions.

### 6.4 Risk scoring and case management

- Maintain a simple rules-based risk tier: low, medium, high, restricted.
- Create review cases with reason codes, relevant event history, evidence references, assigned reviewer, decision, and timestamps.
- Supported decisions: dismiss alert, request information, restrict account, temporarily pause a feature, escalate, or restore access.
- Require dual approval for exceptional overrides or sensitive actions where practical.
- Maintain an audit trail that ordinary operators cannot silently modify or erase.
- Provide clear creator communication for permissible restrictions without revealing sensitive detection logic.
- Establish internal procedures for legally required reporting and response to official requests.

### 6.5 Platform policies

- Prohibit scams, impersonation, unlawful sales, money laundering, copyright infringement, and other unlawful or high-risk content.
- Have a report button on creator pages and products.
- Publish moderation, appeals, suspension, and takedown procedures.
- Keep data collection proportionate and impose access controls and retention periods.
- Seek local legal and payment-provider review before launch to determine applicable registration, AML/CFT, consumer protection, tax, and reporting obligations.

## 7. Protecting digital goods

**Objective:** discourage unauthorized copying and resale without making legitimate purchases painful. Complete piracy prevention is **not possible** once a buyer can access a digital work.

### MVP controls

- Keep original files in **private Cloudflare R2 buckets**.
- Deliver files only after payment verification and entitlement checks.
- Use short-lived, signed download URLs; do not expose permanent object URLs.
- Apply configurable download-count / time limits with a customer-support recovery process.
- Store access and download events for abuse investigation.
- Verify upload ownership declarations and allow copyright complaints/takedowns.
- Generate buyer-specific PDF watermarking where feasible, with privacy-aware wording and disclosed use.
- Define licensing terms for each product, including whether personal use, modification, or resale is permitted.

### Later options

- Visible/invisible watermarking for additional file types where practicable.
- Abuse analytics and infringement reporting workflows.
- More sophisticated streaming or controlled-access delivery for media if demand justifies it.

Do not make false DRM guarantees or allow watermarking to reveal unnecessary personal information.

## 8. Admin dashboard

### Main modules

1. **Overview:** registrations, active creators, payment activity, product sales, reports, alert queues.
2. **Creator management:** search, verify, change status, request additional information.
3. **Content / product moderation:** review listings, reports, and takedown requests.
4. **Transactions:** filter contributions and purchases, provider statuses, exceptions, reconciliation.
5. **Fraud & compliance:** alerts, configurable limits, risk tiers, reviews/cases, action logs.
6. **Platform settings:** fees, categories, content restrictions, payment configuration, feature flags.
7. **Audit and operations:** admin actions, system events, integration errors, exports with access control.

Every high-risk action must enforce permissions on the server, even if the UI hides the control.

## 9. Business model

- **Free creator registration.**
- Platform earns a clearly disclosed, configurable transaction fee on successful eligible contributions and/or digital-product orders.
- Earlier illustrative numbers discussed were around **3% for contributions** and **5% for product sales**. They are *hypotheses*, **not finalized pricing**.
- Model payment-provider costs, refunds, taxes, chargebacks, and operational compliance costs before fixing rates.
- No recurring creator or supporter billing at MVP.

### Go-to-market hypothesis

- Recruit an initial group of approximately **20–30 creators** across different categories for a controlled pilot.
- Help creators publish pages and share links with existing followers.
- Measure whether supporters complete checkout, repeat one-off support, and purchase digital goods.
- Use creator-led distribution (links shared via WhatsApp, TikTok, Instagram, Facebook) rather than requiring a consumer app install.

## 9A. Competitive positioning and product principles (updated)

DuMeGud's model is inspired by **Buy Me a Coffee**, with additional relevant reference points from **Ko-fi** (tips and stores), **Selar** (African digital-product commerce), and Africa-first mobile-money examples such as **Tihada**. These are **benchmark inspirations**, not a claim of unique market features, regulatory approval, or verified current competitor pricing.

- **Primary competitive edge to test:** simple support and digital-product checkout optimized for Sierra Leonean audiences using supported local mobile-money methods.
- **Distribution model:** creators share public links through WhatsApp, TikTok, Facebook, Instagram and other channels; supporters need only a browser.
- **Keep the platform itself in the background:** creator content takes visual priority; DuMeGud branding should be clear but not overpower each creator's storefront.
- **No unsupported claims:** do not advertise “first in Sierra Leone,” “fraud-proof,” “escrow-protected,” “instant payout,” or specific payment methods without verification.
- **Pricing risk:** low-value transactions may be uneconomic after provider fees; validate minimum support amounts, net margin and settlement costs before launch.
- **Research validation:** interview/observe roughly 20–30 creators and test checkout with actual Sierra Leonean phone/network conditions before public launch.

### UX principles

1. **Guest-first checkout:** landing on a creator link should not force an account or app installation.
2. **Single clear action:** support this creator or buy a product, with fees and final total shown before payment authorization.
3. **Payment-state transparency:** distinguish pending, successful, failed, canceled, refunded and under-review states; never imply completion prematurely.
4. **Low-bandwidth resilience:** mobile-first design, quick loading, compressed media, recoverable checkout and sensible retries.
5. **Creator trust:** verified creator signals must have defined criteria; provide report content / impersonation affordances without promising impossible piracy prevention.
6. **Clear rights:** sellers certify their ownership or licenses; customers see permitted product usage and any download limits before purchase.

## 10. Technical architecture

### Stack

| Layer | Proposed implementation |
|---|---|
| Full-stack application | Next.js (App Router, TypeScript) |
| UI | React + Tailwind CSS |
| Backend logic | Next.js server components, server actions, and route handlers |
| Database | PostgreSQL hosted on Neon |
| ORM / migrations | Drizzle ORM + Drizzle Kit |
| Authentication | Better Auth |
| Asset storage | Cloudflare R2 private buckets |
| Payment provider | Monime, pending commercial/technical approval |
| Background jobs | Lightweight durable worker/queue mechanism selected during implementation |
| Hosting | Next.js-compatible managed host or VPS, decision pending |
| Observability | Structured logs, error monitoring, metrics and alerts |

**Architecture principle:** One Next.js application and one relational database for MVP. Avoid separate NestJS services, microservices, and a separate mobile app until necessary. Neon is the managed PostgreSQL database; it does **not** require adopting Supabase or a hosted backend platform.

### Suggested route organization

```text
app/
  (marketing)/
  (auth)/
  (public-creators)/
  (creator-dashboard)/
  (admin)/
  api/
    payments/
    webhooks/
    downloads/
    uploads/
```

### Suggested data entities

- `users`, `accounts`, `sessions`, `roles`
- `creator_profiles`, `creator_verifications`, `social_links`
- `products`, `product_assets`, `product_categories`, `product_licenses`
- `contributions`, `orders`, `order_items`, `payments`, `payment_events`
- `entitlements`, `download_events`
- `risk_rules`, `risk_alerts`, `risk_cases`, `account_restrictions`
- `transaction_limits`, `limit_counters`, `platform_settings`
- `content_reports`, `moderation_actions`, `audit_logs`

Use proper foreign keys, unique idempotency keys, indexes on payment references and high-volume event tables, and monetary amounts in **integer minor units** or exact decimal representations — never binary floating point.

## 11. Security and reliability requirements

- HTTPS, secure cookies, CSRF protections as applicable, strict authorization, input validation.
- Rate limits on sign-in, contributions, uploads, checkout starts, and download endpoints.
- Encrypt sensitive information in transit and at rest; minimize retention of identity documents.
- Signed upload flows and private object access; scan uploads for malware.
- Use provider webhook signature verification and replay prevention.
- Never grant purchases based solely on a browser success page.
- Idempotent write operations for payment events and order fulfillment.
- Record a durable event trail for payment and security actions.
- Ensure backups and test restoration procedures.
- Provide operational alerts for webhook failure, reconciliation drift, queue backlog, and unusual transaction volume.
- Define incident-response procedures and administrator access reviews.

## 12. Non-functional requirements

- **Mobile-first:** optimize for affordable phones and intermittent connectivity.
- **Performance:** keep public pages lightweight; minimize scripts and image size.
- **Accessibility:** usable forms, readable text, labels, and error messages.
- **Scalability:** support gradual adoption with straightforward database indexing and async processing.
- **Localization:** use plain English initially, with Krio-friendly product copy where appropriate.
- **Integrity:** do not show paid status or unlock downloads unless confirmed server-side.
- **Observability:** track operational errors and risk signals while minimizing exposure of personal data.

## 13. MVP acceptance criteria

- [ ] Creator can register, select a unique handle, and publish a compliant profile.
- [ ] Guest supporter can open the page and initiate a one-off contribution.
- [ ] System confirms contribution only after verified payment status.
- [ ] Creator can upload an approved digital file and publish a product listing.
- [ ] Buyer can pay, obtain entitlement, and download through a temporary secure URL.
- [ ] Replaying a webhook does not duplicate revenue or grant duplicate entitlements.
- [ ] Private R2 objects cannot be fetched publicly without an authorized flow.
- [ ] Risk rules can flag rapid payments and volume-limit breaches.
- [ ] Admin can adjust limits and fees without a redeployment, with audit history.
- [ ] Staff can review alerts, restrict accounts as authorized, and document case decisions.
- [ ] Non-admins cannot access admin APIs or other creators' private data.
- [ ] Pending, failed, canceled, and reversed payments are handled safely.
- [ ] Platform terms, prohibited-use policy, privacy notice, and reporting paths are accessible.
- [ ] Payment partner and local legal/compliance readiness has been validated before real-money launch.

## 14. Delivery phases

### Phase 0 — Feasibility and compliance

Confirm with Monime which payment use cases are permissible, flow-of-funds architecture, webhook/payout capabilities, commercial terms, and provider verification requirements. Obtain local legal/compliance guidance. Select baseline controls, initial limits, supported file types, fee structure, and hosting target.

### Phase 1 — Creator and public experience

Authentication, profile setup, public pages, support widget UI, creator dashboard shell, and core admin roles.

### Phase 2 — Payments and digital shop

Provider sandbox integration, safe order/payment state machine, R2 uploads/downloads, product listings, entitlements, receipts, and reconciliation.

### Phase 3 — Trust, operations, pilot

Verification workflows, configurable velocity/volume limits, review cases, moderation, audit logs, incident procedures, and a controlled launch with 20–30 creators.

### Phase 4 — Post-pilot decisions

Improve onboarding and conversion; evaluate creator app demand, additional digital-product protection, discovery/search, support goals, and new payment options. **Subscriptions remain out of scope unless reliable compliant recurring payment capability is proven.**

## 15. Key metrics

- Creator onboarding and verification completion rate.
- Number of activated creators (profile published and payment-ready).
- Share-link visit to completed contribution conversion.
- Share-link visit to completed purchase conversion.
- Gross transaction volume, net platform revenue, and provider costs.
- Checkout success/failure/pending rates.
- Time from confirmed payment to access delivery.
- Disputes/refunds and suspicious-activity alerts per transaction volume.
- False-positive rate and median case-review time.
- Creator retention and proportion of creators receiving at least one contribution or sale.

## 15A. Branding and product-experience acceptance criteria

- [ ] The site consistently renders the brand name as **DuMeGud** in headings, emails, receipts, checkout, and metadata.
- [ ] Approved brand tokens can be switched centrally without editing individual components.
- [ ] Final logo works in header navigation, footer, social share preview, and favicon/icon dimensions.
- [ ] The logo is distinguishable and legible in monochrome and against light/dark backgrounds.
- [ ] Checkout and financial amounts remain readable with accessible contrast; brand accent alone never signifies payment success/failure.
- [ ] Public pages render effectively on common low-end mobile devices and slow connections.
- [ ] Mobile checkout works without creating a supporter account or installing a mobile app.
- [ ] Fee disclosure, payment pending screens, digital entitlement, and receipt text are consistent with approved policy.

## 16. Open questions and decisions pending

1. **Monime architecture:** exact ownership and movement of funds, platform vs creator spaces, payout path, settlement timing, refund paths, reserves, and provider approval.
2. **Compliance:** which legal obligations and licenses apply, including KYC/AML/CFT, reporting, privacy, tax, and consumer protection in Sierra Leone.
3. **Initial risk limits:** production transaction, daily, rolling-week, rolling-month, and tier-based caps, along with escalation and review SLAs.
4. **Payment rails:** precise eligibility of Orange Money, AfriMoney, and any later methods for tips and digital-goods purchases.
5. **Pricing:** contribution fee, digital-sales fee, and who bears Monime or other processing costs.
6. **Payout experience:** timing, conditions, beneficiary verification, and restrictions (not decided).
7. **File constraints:** maximum size, permitted formats, watermark treatment by category, and refund policy.
8. **Operations:** hosting, background queue, email/notification provider, support tooling, and monitoring vendor.
9. **Legal documents:** terms, privacy policy, seller agreement, licensing language, DMCA-style/takedown process appropriate to local law, and dispute policy.
10. **Brand checks:** domain/social handle availability and trademark clearance for **DuMeGud**.
11. **Brand selection:** final typography, approved palette, icon geometry, logo master assets and tagline.
12. **Market validation:** competitor availability in Sierra Leone and real payment-flow testing, not just marketing claims.

---

**Revision note (v1.2):** Added brand strategy, three color explorations, font/whitespace/negative-space principles, competitor positioning, product UX principles, and explicit brand sign-off criteria. No unapproved visual concept is represented as finalized.

**Document intent:** This PRD records the decisions made so far and separates implementation-ready MVP features from unresolved financial and regulatory choices. Example monetary limits and fee rates are deliberately non-binding until confirmed.
