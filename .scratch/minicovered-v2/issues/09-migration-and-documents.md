# 09: Migration to version 2, and the documents

**What to build:** `PROJECT_VERSION` becomes 2 and v1 files migrate on read rather than being refused. A v1 Design has exactly one J-Card and one Back Card, which is exactly a 2-Page Insert; the `jcard` and `back-card` toggles collapse to one `insert` toggle; Label measurements move out of the Design and into app settings (ticket 06).

v1.0.0 is public. The v1 rename shipped without a migration and told people to export first; doing that twice, the second time to a released version, is how a tool teaches people not to trust it with their work.

**The documents move together with the code:**

- **CONTEXT.md** gains **Insert** and **Page**, keeps Front Panel, Spine and Inner Flap unchanged as sections of the Insert, and marks **J-Card** and **Back Card** as retired v1 Parts rather than deleting them — six ADRs name them. The J-Card entry's `_Avoid_: Insert` is flipped.
- **README.md** stops promising three Parts and a Back Card.
- The v1 spec's **"case stickers"** backlog line is struck: the Label is the cartridge sticker and that is the whole of it.

**Blocked by:** 06, 08.

**Status:** done

- [x] A v1 project file opens as a queue of Inserts with nothing lost — `src/persist/version-one-migration.test.ts`
      opens a whole realistic document and then prints it. **Not "of 2-Page Inserts"**; see below.
- [x] A version-2 file is refused by a version-1 reader, with the existing message — `PROJECT_VERSION`
      has been 2 since ticket 06 and the refusal sentence is untouched.
- [x] Label measurements from a v1 file land in app settings, not on one Design — ticket 06 moved them;
      `readMeasurements` reads a v1 document's first stated `dimensions` block as the project's.
- [x] CONTEXT.md, README.md and the v1 spec agree with the code

## Amendments to this ticket, found while building it

**Four of the five things this ticket asks for were already done**, and the ticket reads as most of a
release when it is in fact four documents and one test.

1. **"`PROJECT_VERSION` becomes 2"** — it already was; ticket 06 bumped it.
2. **"the `jcard` and `back-card` toggles collapse to one `insert` toggle"** — done in ticket 08
   (`LEGACY_PARTS` in `project-file.ts`), because an Insert cannot be rendered without a `PartKind`
   for it.
3. **"Label measurements move out of the Design and into app settings (ticket 06)"** — done in 06, as
   its own parenthesis admits.
4. **"CONTEXT.md gains Insert and Page"** — done in 08, along with a third entry this ticket does not
   name: **Fold**, which is where the three fold kinds are defined for a collector. It also says
   "six ADRs name them" and five do — 0005, 0007, 0010, 0011 and 0012.

**"A v1 project file opens as a queue of 2-Page Inserts" is wrong, and the difference is a feature.**
No `pageCount` is read from a version-1 file, so the count is derived from the content. A 1.0 file
opens at two Pages because a 1.0 Release has nothing else to say — but 1.1 files also carry version 1
and *can* carry Discogs credits, and one of those opens at **four**, with its credits on a Page of
their own. ADR-0012's migration paragraph made the same mistake and was corrected in ticket 08; the v2
spec's Testing Decisions was the last place still carrying it and is corrected here.

**A version-1 file's `backCard` block is deliberately not read.** The Back Card's 69 mm width has no
counterpart on the strip, whose Pages are 65 mm by the case rather than 69 by the old rectangle.

**One bug, found by looking at the rendered page rather than at the numbers.**
`.spec__note` caps itself at 90 px with `overflow: hidden` so a warning can give up
its room when the band condenses, and 90 px is four and a half lines. ADR-0012's
shortfall runs to **six** on Letter, so every Letter collector with credits read
"…a printable margin of 7.25 mm or less; Letter's long edge" and then nothing — the
one sentence that says which Page went and why. No unit test could reach it: the
sentence is complete in the DOM, and ticket 08's browser round read `textContent`.
Fixed as an override on the two states where `--cond` is 0, rather than as a larger
number, because how tall a warning is depends on its sentence and on how many fired
at once.

**The documents that turned out to be wrong were not only the three this ticket lists.**
`package.json`'s `description`, `index.html`'s meta description and the PWA manifest in
`vite.config.ts` all still sold "J-Cards, Back Cards and cartridge Labels", and four comments in `src`
still counted three Parts — `workspace.ts`, `app.css`, `part-band.ts` and `design-controls.ts`, the
last of which claimed a Template can read three toggles when the most any reads is two. The about
dialog's own specimen line advertised the app as `87.5 × 79 mm`, which is the retired J-Card's flat
size; it reads 73.5 × 79 now, which is the assembled Insert and the box the Parts band captions.
