# 03: Classic bleeds three edges, and every Template draws its own tracklist

**What to build:** Classic's Front Panel artwork runs to the top, left and right edges of the panel, with type on solid paper below it rather than inset as a square. The old inset square stays reachable as a Template parameter.

Separately, `drawBackCard` in `src/render/templates/shared.ts` stops being shared. `CLASSIC_TEMPLATE` and `FULLBLEED_TEMPLATE` currently point at the same function, so switching to Full-bleed changes the Front Panel and the Label and leaves the tracklist identical. Each Template draws its own: the Release's colour as a full-bleed ground, type reversed out of it, tracks as a two-column table with durations, and the lonely 0.2 mm rule gone.

No bleed allowance — the artwork edge is the cut line, by decision.

**Blocked by:** 02 (the tracklist Page wants a face that is not the Front Panel's).

**Status:** ready-for-agent

- [ ] Classic's artwork reaches three panel edges; type sits on paper, not on the image
- [ ] The inset square is reachable as a parameter and still renders as v1 drew it
- [ ] Classic and Full-bleed draw visibly different tracklist Pages
- [ ] Durations render when present and the column layout survives a 25-track Release
- [ ] Overflow, shrink and the print-floor warning still behave as ticket 07 of v1 specified
