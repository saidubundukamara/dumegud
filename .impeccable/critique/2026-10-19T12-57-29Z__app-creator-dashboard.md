---
target: creator dashboard (excluding products)
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
timestamp: 2026-10-19T12-57-29Z
slug: app-creator-dashboard
---
Method: dual-agent (A: design review · B: detector + browser evidence). Mobile not screenshotted (window resize ignored); CSP blocked the detector overlay.

## Design health: 24/40 (Acceptable)
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Pending gifts undated; no active nav while streaming |
| 2 | Match system / real world | 3 | Raw ISO/UTC dates; support called "payment" |
| 3 | User control & freedom | 2 | Withdraw, Hide my page, Sign out everywhere were one tap |
| 4 | Consistency & standards | 2 | Three names per page; status chip vs plain text; 3 empty-state styles |
| 5 | Error prevention | 2 | Withdraw disabled without reason; KYC submittable mid-upload |
| 6 | Recognition over recall | 3 | ID → number → withdraw chain spread over 3 pages |
| 7 | Flexibility & efficiency | 1 | No search/filter/totals on Supporters/Orders |
| 8 | Aesthetic & minimalist | 3 | Home dominated by 6 share links |
| 9 | Error recovery | 3 | Upload errors in muted grey |
| 10 | Help & documentation | 2 | "Contact support" unlinked |

## Priority issues
- [P1] One-tap irreversible withdraw, no receipt
- [P1] Withdraw prerequisites scattered across 3 pages
- [P1] Copy broke the support-not-payment rule
- [P1] One destination, three names
- [P2] Flat 10-item nav; Home lacked a money signal; shared-pattern drift (input contrast, dates, panels, empty states); long money motion
- [P3] Thin ID upload feedback

## Detector
0 findings in 16 files and components/ui. DOM: no em-dashes, no unlabeled controls; some standalone controls under 44px ("Add a link", Copy).

## Follow-up (2026-10-19 polish pass)
All P1/P2 and the P3 upload items were addressed in commits d760dae..HEAD. Not done: Supporters/Orders search, filters and totals (heuristic 7).
