# Three-panel J-Card plus separate Back Card

> **Superseded by [ADR-0012](0012-the-insert.md).** The three-panel J-Card and the separate Back
> Card become one folded **Insert**; a Release has two Parts, not three. This ADR is kept because it
> records why the wraparound was rejected in v1, and 0012 reverses that judgement explicitly.

mdcovergen generates the case inserts as a three-panel J-Card (Front Panel + Spine + Inner Flap) plus a separate Back Card carrying the tracklist. This matches the community and print-shop standard for small MD cases: atriptych's template measures 14 + 5.5 + 68 mm at 79 mm height, Band CDs ships a front-outer/rear-inner pair, and duplication shops describe the inlay as "spine + return + cover". Rejected alternatives: a full wraparound that includes the back panel (a print-shop special whose fit in ordinary cases is unproven) and the old web tools' hack of two cards that each carry their own spine strip (a 5.5 mm case spine can only ever show one). Consequence: a Release has three Parts (J-Card, Back Card, Label); Sheets lay the J-Card out unfolded with fold guides, and the Back Card as its own rectangle.
