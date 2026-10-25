---
target: app/(admin)/admin
mode: operate
score: 28
max: 40
na: []
method: dual-agent
---

# Critique: DuMeGud admin console (shell, Overview, Transactions, Creator detail, Payouts, Risk case)

Method: dual-agent (A: design review · B: detector + browser evidence)

## Design health: 28/40 (good)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Contradictory records (settled before created, creator share above gross) raise no warning |
| 2 | Match with the real world | 3 | "Not paid yet", "Recent payments", "Tiktok" broke copy rules (fixed) |
| 3 | User control and freedom | 3 | Risk decisions and risk tier had no confirm (decision fixed) |
| 4 | Consistency and standards | 3 | One ActionForm/Section/DataTable grammar; confirm button tone was loose |
| 5 | Error prevention | 2 | Status confirm ignored the chosen status (fixed) |
| 6 | Recognition rather than recall | 3 | Phone transaction rows are identical ("Le 55.00 Succeeded") |
| 7 | Flexibility and efficiency | 3 | ⌘K is strong; no queue shortcuts or bulk actions |
| 8 | Aesthetic and minimalist design | 3 | Creator Overview stacks three action cards |
| 9 | Error recovery | 3 | Step-up prompt appears in place, but needs a second press |
| 10 | Help and documentation | 2 | Thresholds ("large withdrawals") aren't stated |

## Specificity

Assessment A: the copy and structure are authored for this product: "Money in Monime", "Settled, not yet moved to creators", two-admin release, holder name vs ID. The visual layer is category-generic: maroon tile, hairline cards, pill badges.

Assessment B: the CLI detector found 0 findings across `app/(admin)/admin` and `components/admin`. Browser overlay injection was blocked by the app's static CSP (`script-src 'self'`; the detector is on another origin). That is expected and correct; no overlay is available.

## Priority issues

- **[P0] Status change confirm ignored the chosen status.** Fixed. There is now one button per target status (Reactivate, Restrict, Suspend, Close) with its own dialog: "Suspend @handle?", the enforced consequence, and the reason asked inside the dialog. The confirm button is red; the triggers are quiet.
- **[P1] Risk decisions applied without a confirm, with about 11 options visible.** Fixed. Decisions are a radio group, and each choice shows what it does (checked against `CaseService`). The feature picker shows only for "Pause one feature". "Record decision" now confirms.
- **[P1] Payout review asked staff to compare names it didn't show.** Fixed. The Review section shows "Name on the number" beside "Name on their ID". Approvers (`payouts.approve`) and `kyc.view` holders see the approved legal name.
- **[P2] Phone tables lose identity.** Open. Use a two-line first cell (amount plus creator and time) instead of hiding columns.
- **[P2] Contradictory payment records aren't flagged.** Open. Add a danger notice on the transaction detail.

## Persona red flags (open)

- **Finance at month end:** no bulk release, no "next in queue", and payouts/all filters only by status.
- **Support on a phone:** the creator tabs overflow; the actions sit at the bottom of a long page.
- **Keyboard or screen-reader user:** palette group headings use `role="presentation"`; the collapsed nav relies on `title`; the StatTile caret shows only on hover.

## Minor

- "Fee (quoted)" vs "Fee (charged)" is jargon.
- Zero tiles look like skeletons at a glance.
- `--dmg-radius` is soft for a dense tool.
- Risk tier change has no confirm. It is CAS-guarded and reversible, so this is low priority.

## Questions

1. Should high-stakes screens (release, restrict) get their own visual register?
2. Should the console open on "your next item" for queue workers rather than the overview?
