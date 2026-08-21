# How a print tool should show its own output — and what the peers actually do

Companion to `modern-retro-register.md` (the Register) and `oldschool-registers.md`. Different question: **what belongs on screen while
someone designs a Part, and where does the A4 Sheet go.** Written because the round-2 prototype previewed the Sheet and the Sheet only,
which put the Front Panel on screen at roughly 2× physical size — too small to judge anything that is being designed.

Everything below is read off a primary source or measured from a screenshot of the running tool. Anything not verified is marked.

---
## 1. The three peer tools: none of them previews a sheet of paper

Measured from headless screenshots at 1400 px wide, 2026-08-21.

| Tool | What is on screen | Scale of the artifact | Where the form lives |
|---|---|---|---|
| **Tapercraft — MiniDisc J-Card Maker** (https://vhs.texs.org/en/minidisc-jcard) | the J-Card alone, flat, unfolded, filling the viewport; Spine type set vertically and readable | Front Panel ≈ 540 px for 68 mm ≈ **8×** | floating chips over the artifact (`Layout`, `Color Controls`) |
| **jkap — minidisc label generator** (https://md-label.jkap.io/, repo `jkap/minidisc-label-maker`) | the Label alone, nothing else above the fold; carries `INSERT THIS END` + the MiniDisc logo | Label ≈ 450 px for 38 mm ≈ **12×** | plain underlined fields *below* the artifact |
| **ed7n — J-Card Template** (https://ed7n.github.io/jcard-template/) | one J-Card unfolded as a strip with fold lines and corner crop marks, on a neutral grey mount | Front Panel ≈ 245 px for ~100 mm ≈ **2.5×** | right-hand form column, collapsible sections |

**Unanimous: one Part at a time, large.** Not one of the three shows an imposition sheet, and not one shows all Parts at once.
jkap is the extreme — the artifact is ~12× physical size and the tool has exactly one Part.

Note for the spec: `.scratch/minicovered-v1/spec.md` claims "No existing free tool covers all three Parts at once (jkap: label only;
RunePML: cover + spine only; atriptych: static templates)." Tapercraft is a fourth entrant not in that list — it covers the J-Card
(Front Panel + Spine) interactively, is freemium with a sign-in wall, and also does VHS, cassette, CD and vinyl. It does **not** appear
to cover the Back Card or the Label, so the gap the spec names survives; the competitive claim needs the extra name. *Feature list read
from the landing page only — not exercised behind the sign-in.*

---
## 2. The imposition step is separated on purpose, and it happens last

Adobe's own documentation for InDesign's Print Booklet: imposition is handled **in the print stream**, so "your document pages stay in
normal reading order", and converting a layout spread to a printer spread "should be done just before you're ready to print"
(https://helpx.adobe.com/indesign/desktop/print/print-booklets/impose-documents-for-booklet-printing.html,
https://helpx.adobe.com/in/indesign/using/printing-booklets.html). The trade view is blunter: imposition "is the job of the printer
who use dedicated softwares to do this, and the designer should deliver single page PDF file"
(https://thatkeith.com/articles/what-a-page-imposition/ and the Adobe community threads linked from it).

Applied here: **the Sheet is an output artifact, not a design surface.** Packing three Parts inside the printable margin with cutting
guides is a print check — margins, count, guides — and it belongs immediately before Export, not permanently beside the controls.

---
## 3. Packaging practice: flat to edit, assembled to judge — both, in that order

The dieline (flat) is where artwork is laid out, because it is the only view in which every panel is addressable. The assembled
preview is then a separate, later step, and it exists to catch what flat cannot show: "the functionality of fold lines, perforation,
accuracy of cut lines, visual impact of colors, and even box sizes or styles"
(https://pakfactory.com/blog/what-is-a-dieline, https://soonpak.com/what-is-a-dieline/,
https://www.manageartworks.com/packaging-dieline-management). Industry structural tools (Esko ArtiosCAD, Pacdora, appsforlife 3D Box)
all ship the pair.

Applied to the J-Card, which is the only folded Part: the flat 87.5 mm strip is what prints, but the **assembled** form — Front Panel
face-on with the 5.5 mm Spine standing beside it — is the only view that answers "does the Spine read the right way up on the shelf",
which CONTEXT.md already singles out as bottom-to-top. Both views earn their place; the assembled one is the default, because it is
what the user will hold.

⚠️ **Not** a licence for skeuomorphism (ADR-0008 rule 3). Assembled here means orthographic flat geometry with the fold marked — no
perspective, no plastic shading, no drop-shadow pretending to be a case.

---
## 4. Two hard numbers worth designing against

- **Pointer targets: 24 × 24 CSS px minimum.** WCAG 2.2 SC 2.5.8 Target Size (Minimum), normative: "The size of the target for pointer
  inputs is at least 24 by 24 CSS pixels", with five exceptions — the useful one being *Spacing*: undersized targets pass if a 24 px
  diameter circle centred on each does not intersect another target's circle
  (https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). The round-2 icon buttons were ~26 × 24 px with 3 px gaps —
  passing only by the spacing exception, and worth fixing outright.
- **Screen "1:1" is nominal, not true.** CSS `mm` is defined against a 96 dpi reference pixel (1 mm = 3.7795 px), which is not the
  physical size on almost any real display. A 1:1 button is still useful, but it must be labelled as nominal; the honest true-size
  path is the printer calibration sheet the project already has (Ticket 06), not a screen ruler.

---
## 5. What this changes in the design

1. **The Parts are the composition, not the contents of a preview box.** Three specimens laid out on the page at **one shared scale**,
   so their real relative sizes are visible — J-Card 87.5 × 79, Back Card 69 × 79, Label 35 × 52.5 mm.
2. **The J-Card defaults to assembled**, with a flat toggle. Fold lines fine and dashed; the Spine's type vertical and readable.
3. **The Sheet becomes a check**, folded away next to Export: Parts packed, margin, guides, page count. It keeps the neutral mount,
   because that is the one view where a sheet of paper is genuinely the subject.
4. **The mount disappears from the design surface.** A Part's paper is a *print* colour the user chose; each Part is separated from the
   page by a hairline at 3:1 plus a soft shadow, the way a plate is separated in a catalogue. Neutral-surround colour judgement moves
   to the Sheet check, where it belongs.
5. **Scale target: 4–8×**, not 2×. At the round-2 Sheet scale the Front Panel was ~140 px for 68 mm; the peers run 8–12×.
