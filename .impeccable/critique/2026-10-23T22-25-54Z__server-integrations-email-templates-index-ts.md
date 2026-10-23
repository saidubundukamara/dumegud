---
target: email templates
total_score: 18
max_score: 36
na_heuristics: 7
p0_count: 1
p1_count: 2
timestamp: 2026-10-23T22-25-54Z
slug: server-integrations-email-templates-index-ts
---
# Critique: transactional email templates (server/integrations/email/templates/index.ts)
Method: dual-agent (A: design review, B: detector + browser overlay)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | Money emails lack arrival time/reference; receipt has no price |
| 2 | Match real world | 3 | "withdraw your earnings" leans "get paid" |
| 3 | User control | 2 | "contact support" with no channel |
| 4 | Consistency | 2 | Button vs raw URL varies |
| 5 | Error prevention | 3 | Expiries, don't-share, cooldown explained |
| 6 | Recognition | 2 | Receipt lacks creator/price/method |
| 7 | Flexibility | n/a | Single-path transactional email |
| 8 | Aesthetic/minimal | 3 | Fallback URL noise under every button |
| 9 | Error recovery | 1 | payout-failed / kyc-rejected / password-changed lack recovery path |
| 10 | Help | 0 | No support contact anywhere (LEGAL.contactEmail exists) |
| Total | | 18/36 | |

Specificity: generic; palette from styles/tokens.css unused; copy is the strongest part.
Detector: 15x flat-type-hierarchy (12/13/16/18/22px), 1x em-dash false positive (index page). Browser overlay agrees.
Mechanical: no lang/charset/viewport/title/color-scheme/preheader; div layout (Outlook full-bleed); non-bulletproof button.

P0 Security/failure emails dead-end (password-changed no button, payout-method-changed no reset link, no support).
P1 Not built to email standards (head metas, preheader, tables, bulletproof button, dark mode).
P1 Raw URLs in prose: register-existing, password-changed, library-links (0 anchors).
P2 Receipt lacks price, creator, date, method; subject slice without ellipsis; reads as phishing to non-users.
P2 Palette not applied (maroon button, ink text, muted secondary; orange never as text).
Minor: h1 weight/line-height unset; Le amounts can wrap; default footer wrong for buyers; KYC note newlines collapse; kyc-approved CTA points to verification not payout number; "earnings" wording.
