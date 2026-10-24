---
target: Highlights (recaps + milestones)
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-10-24T12-17-10Z
slug: app-creator-dashboard-highlights-page-tsx
---
Method: dual-agent (A: design review sub-agent, B: detector sub-agent)

## Design Health Score (before polish)
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | Preview spinner never ends on a failed load; Share gave no download feedback |
| 2 | Match system / real world | 3 | Hidden-amount milestone card copy ("New / milestone…") was vague |
| 3 | User control and freedom | 2 | Toggling format/amounts wiped caption edits (key={text}) |
| 4 | Consistency and standards | 2 | Two studios on one page shared radio name and textarea id |
| 5 | Error prevention | 2 | Share sent the default caption, not the edited one |
| 6 | Recognition over recall | 3 | Month picker sat below the recap it changes |
| 7 | Flexibility and efficiency | 2 | Every share goes through the full studio |
| 8 | Aesthetic and minimalist design | 2 | Two previews, two caption editors stacked on phones |
| 9 | Error recovery | 2 | Share-permission timeout reported as "couldn't make the card" |
| 10 | Help and documentation | 3 | Format hints and the amounts note are good inline help |
| **Total** | | **23/40** | Acceptable, interaction defects |

## Design specificity
Product thinking is specific (Status/Stories hint, Le amounts, payer-grouped supporters, amounts off by default, quiet-month nudge). The visual language reuses the incumbent maroon + orange glow; nothing yet says Freetown. The recap tile grid is the hero-metric pattern, earned here because the metrics are the content.
Detector: 0 findings across 6 targets (exit 0). Browser overlay skipped (logged-in surface).

## Priority issues
- [P1] Share fetched the PNG after the tap; on slow networks the share permission window expires. Fixed: card fetched once per format, kept as a File, shared from the tap; NotAllowedError asks for one more tap.
- [P1] Caption edits ignored and erased. Fixed: caption state lives in ShareStudio, follows the amounts switch until edited, and Share sends the edited text.
- [P1] Duplicate radio name / textarea id across two studios. Fixed with useId.
- [P2] Page too long on phones. Fixed: month picker above the recap, caption behind a disclosure, story preview 11rem on phones.
- [P2] Every toggle re-rendered the card on the server. Fixed: cards cached in memory per format; previous card stays visible while the next loads; failed loads show a retry. Kept no-store on the routes (URL doesn't name the creator, so HTTP caching could leak between accounts on a shared phone).

## Persona red flags
- First-time creator on a cheap Android: data use per toggle (fixed by in-memory cache), hanging spinner (fixed), download fallback location (copy now says Downloads).
- Returning creator: "Not now" clears all pending milestones (intentional: one celebration covers the pile); no one-tap share from Home (open).

## Minor / open
- PNG shows @handle and the link (kept: handle identifies, link converts).
- Settings uses checkboxes + Save while the studio uses a switch.
- Confetti replays per Home visit until dismissed.

## Questions
- Should the call to action live entirely on the image, given WhatsApp Status drops captions?
- Should Highlights be one tap from Home rather than in the Fans group?
- What visual signature beyond maroon + glow would make a card recognisably DuMeGud in a Freetown feed?
