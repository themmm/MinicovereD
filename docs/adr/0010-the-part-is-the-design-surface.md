# The Part is the design surface; the Sheet is a print check

The app shows **the Parts, at one shared scale, as the composition of the page** — J-Card, Back Card and Label as three
specimens the user designs against. The A4 **Sheet** stops being the permanent companion of the controls and becomes a
fold-out verification step beside Export: paper, printable margin, what packed onto how many Sheets, cutting guides.

Until now the preview was the Sheet and only the Sheet. That put the Front Panel on screen at roughly **2× physical
size** — 68 mm rendered at about 140 px — while two-thirds of the preview area showed empty paper, because Parts pack to
the top-left. The thing being designed was the least legible thing on screen.

## Why, from three independent directions

**The peers are unanimous.** Measured from headless screenshots of the three tools that exist in this niche
(`.scratch/research/preview-composition.md`): Tapercraft shows the J-Card alone at ≈8× (`vhs.texs.org/en/minidisc-jcard`),
jkap shows the Label alone at ≈12× and nothing else above the fold (`md-label.jkap.io`), ed7n shows one J-Card unfolded
with fold lines and crop marks at ≈2.5× (`ed7n.github.io/jcard-template`). **Not one of them previews a sheet of paper,
and not one shows several Parts at once.**

**Imposition is deliberately separated, and it happens last.** Adobe's own documentation: imposition is handled in the
print stream so "your document pages stay in normal reading order", and converting a layout spread into a printer spread
"should be done just before you're ready to print". The trade view is blunter — imposition belongs to the printer, and
"the designer should deliver single page PDF file". The Sheet is an output artifact, not a design surface.

**Packaging practice supplies the pair.** The dieline (flat) is where artwork is laid out, because it is the only view in
which every panel is addressable; the assembled preview is a separate, later step, and it exists to catch what flat
cannot show — fold-line function, cut-line accuracy, the visual impact of colour. Applied to the J-Card, the only folded
Part: the flat 87.5 mm strip is what prints, but only the assembled form answers "does the Spine read the right way up on
the shelf", which CONTEXT.md already singles out as bottom-to-top.

## What this decides

1. **Three specimens, one shared scale.** Every width is literally its millimetres: `calc(87.5 * var(--mm))`,
   `calc(69 * …)`, `calc(35 * …)`. One token, one truth, and the real size relationships stay visible. Resting scale is
   ~6 px/mm; the peers run 8–12, so a Part can be **clicked to isolate it** at 7–13 px/mm, viewport-capped.
2. **The J-Card defaults to assembled** — Front Panel face-on with the 5.5 mm Spine standing beside it, Inner Flap folded
   behind — with a toggle to the flat strip that actually prints. Orthographic, fold marked with a fine dash. **Not a
   licence for skeuomorphism** (ADR-0008 rule 3): no perspective, no plastic shading, no shadow pretending to be a case.
3. **The Sheet becomes a check**, collapsed beside Export, and it keeps the neutral mount — it is the one view where a
   sheet of paper is genuinely the subject.
4. **The mount leaves the design surface.** A Part's paper is a *print* colour the user chose; each Part is separated
   from the page by a hairline at 3:1 plus a soft shadow, the way a plate is separated in a catalogue. Neutral-surround
   colour judgement moves to the Sheet check, where it belongs. (ADR-0008 rule 9 still governs both.)
5. **Warnings sit at their cause** — tracklist overflow under the Back Card, Spine type size under the J-Card — instead
   of collecting in one list away from the Part that produced them.
6. **Everything that is not search or selection is collapsed by default**, each fold carrying a summary line so its
   contents are known without opening it. Search is permanent in the header and is the widest element there, being the
   entry point.

## What it costs

`src/app/sheet-preview.ts` currently owns a single canvas, a pager over Sheets and the export. It gains a second mode —
per-Part rendering at a chosen scale — and loses its position as the permanent right-hand column. The renderer itself is
untouched: Parts and Sheets already come from the same `rasterizeSheet` call at different DPI, which is the property that
makes "what you see is what you get" true, and none of this changes it.

Accepted cost: the Sheet is one click further away, so a user who never opens it never sees how their Parts are packed.
Mitigated by putting the numbers that matter — *1 × A4 · 3 Parts · margin 5.0 mm* — on the closed fold's summary line, so
the packing is legible without opening anything.

## Rejected

**Keeping the Sheet as the only preview**, which is the state this ADR replaces: it is unanimous against the field, and
it renders the designed object too small to judge.

**Showing all three Parts *and* the Sheet side by side.** Two views of the same thing competing for the same attention;
the Sheet wins on size and loses on usefulness.

**A physical mockup of the case.** Tempting, and it is what the packaging tools do, but ADR-0008 rule 3 rules out the
plastic, the perspective and the shading that would make it read as a case rather than as a drawing. The assembled J-Card
is as far as this register goes.
