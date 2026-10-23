---
target: date-of-birth sign-up flow
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-10-23T21-56-12Z
slug: app-auth-welcome-age-page-tsx
---
Method: dual-agent (A: design review · B: detector+browser)

Heuristics 23/40: H3 user control 1 (gate has no exit; under-18 deletes without confirm), H5 error prevention 1, H4 consistency 2, H7 efficiency 2 (Android calendar opens on Oct 2008), H9 recovery 2 (focus lost, generic banner); others 3.

Detector: 0 findings in target files. Overlay: site-wide overused-font (Geist) only. Browser: 52px input, labelled, aria-describedby ok, max set client-side, no CSP/hydration errors; under-18 page link 26px tall.

Priority issues:
- [P0] Google gate: wrong year deletes account instantly. Fix: confirm step with the date + age.
- [P1] Gate has no exit. Fix: "Use a different account" (sign out + remove pending account); explain Google doesn't share birthdays.
- [P1] Android native date picker is slow for adult birth years. Fix: Day / Month / Year fields with numeric keypad.
- [P2] Focus lost after error; hint duplicates error. Fix: focus first invalid field; differentiate hint/error.
- [P2] Refusal page copy inaccurate on Google path ("didn't create your account"); 26px link only.
Minor: put DOB after Name so Email+Password stay together. Password wiped on error is an existing pattern across auth forms.
