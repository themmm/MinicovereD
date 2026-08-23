# MinicovereD

A tool for designing and printing cover inlays and disc labels for MiniDiscs. The glossary covers the domain from the metadata of a release through to the printed sheet.

## Language

### From Release to Sheet

**Release**:
The metadata unit that serves as the source for a Design: artist, album, tracklist, cover image, and supplementary info (e.g. year). Can be fetched automatically or created by hand (e.g. a mixtape).
_Avoid_: Album, Titel, Projekt

**Credits**:
What a second database knows about a pressing beyond its tracklist: who did what, and the label,
catalogue number, country, year, genre and style it came out under. **One block from one source**
(ADR-0013) — never merged into the fields the collector types, so a Release's `year` and `notes` stay
theirs. Structured, not prose: Discogs' own `notes` field is pressing annotation and is never read.
_Avoid_: Liner notes, Notes, Personnel, Mitwirkende

**Part**:
One of the two printable artifacts belonging to a Release: Insert or Label.
_Avoid_: Seite, Element

**Insert**:
The one folded piece that slides into the front of the MiniDisc case (ADR-0012). Flat, it is a
single strip: Inner Flap, Spine, Front Panel, then as many Pages as the Release needs. Folded, it is
a booklet that lives entirely inside the front cover — the back slot stays empty, and a shelved case
therefore no longer shows its tracklist, which is the price of one piece instead of two.
Accurate at two Pages or at eight, which is why it beat `Wrap` (nothing is wrapped), `Booklet`
(untrue at two Pages, the common case) and `Leporello` (precise for a concertina, wrong for
something that pages like a book).
_Avoid_: Wrap, Booklet, Leporello, Einlage, J-Card

**Page**:
One face of the Insert, 65 mm wide but for the first. **Page 1 is the Front Panel** — the cover the
case window shows — and the Pages after it carry the tracklist, the credits and, on the odd Page
out, the artwork again as a back cover. The count is always **even**, because single-sided printing
makes every leaf two Pages thick (ADR-0012), and it is derived from what the Release has to say
with an override per Design. Four is the most one A4 Sheet holds; Letter holds two.
_Avoid_: Panel, Leaf, Side, Seite

**Front Panel**:
The 68 mm face of the Insert visible through the case front, and **Page 1**.
_Avoid_: Cover, Vorderseite

**Spine**:
The 5.5 mm edge of the Insert visible when the case is shelved. Carries artist, album, and the logo. Everything on it reads **bottom-to-top**, so a case standing on a shelf is read by tilting the head to the right; the logo turns with the type rather than sitting upright against it.
Not to be confused with the **spine fold** between two Pages, which is the booklet's hinge; see Fold.
_Avoid_: Edge

**Inner Flap**:
The 14 mm end of the Insert folded inside the case to hold it in place.
_Avoid_: Flap

**Fold**:
A crease across the Insert, and there are three kinds because the collector has to fold two of them
in opposite directions (ADR-0012). A **case** fold wraps the case — the Spine round its edge and the
Inner Flap in behind, which are the J-Card's own two folds unchanged. A **fore-edge** fold doubles a
leaf back on itself, blank against blank, away from the printed side. The **spine** fold is the
booklet's hinge, printed against printed, and is the one fold that goes the other way: open the
cover and the two Pages either side of it face you as a spread. Marked with three different dash
patterns on the printed Sheet, because that is the only instruction a collector gets.
_Avoid_: Crease, Score, Falz

**J-Card** _(retired, v1)_:
What the Insert replaced: a three-panel card — Front Panel, Spine, Inner Flap — that slid into the
front of the case (ADR-0005, superseded by ADR-0012). Kept here because six ADRs and the v1 spec
name it and a reader who meets it needs the glossary to say what became of it. Its three panels
survive as sections of the Insert; its measurements are the Insert's first four.

**Back Card** _(retired, v1)_:
What the Insert absorbed: a separate card that slid into the back of the case and carried the
tracklist (ADR-0005, superseded by ADR-0012). The tracklist is now a Page inside the booklet, and
the case's back slot stays empty.

**Label**:
The sticker applied to the top of the MiniDisc cartridge. Rectangular; one corner may be cut diagonally to clear the cartridge's own cut corner, or left square to cover it. The notch is a choice, not part of the definition.
_Avoid_: Aufkleber, Sticker

**Sheet**:
A printable paper-size surface (default A4) on which one or more Parts are arranged with cutting guides. The unit that gets exported as a PDF.
_Avoid_: Seite, Druckseite

**Cutting Guide**:
A print-only mark on the Sheet that shows the boundaries of the Parts for cutting with scissors or a cutter.
_Avoid_: Schnittlinien

**Turned**:
A Part lying on its side on the Sheet, 90° clockwise, because it is longer than the printable area is
wide. The
**Part** turns and the Sheet never does — there is no portrait/landscape control, and A4 and Letter
keep the dimensions they have always had (ADR-0014). Kept apart from *rotated*, which is what type and
images do inside a Part: the Spine's line is rotated, and the Part carrying it may also be turned. A
turn answers the size of the paper rather than deciding anything about the record, so it lives on the
Sheet check and never on the design surface: a Part packed turned is still shown standing up.
_Avoid_: Rotated (of a whole Part), Landscape, Orientation, Gedreht

**Template**:
A named visual scheme that determines the layout, typography, and color logic of a Part. Parameterized per Design.
_Avoid_: Theme, Stil, Design

**Design**:
A Release together with the choices that turn it into Parts: Template, its parameters, and how many
Pages the Insert folds into when the collector overrode what the content asked for. The unit
the Queue holds and a project file carries. A Release is what the album *is*; a Design is what this
collector decided to print about this record. How big it is cut is not part of it; see Measurements —
though the Page count is the one thing here that changes how much paper a Part takes, which is why it
is a Design and not a Design choice: it cannot carry forward to a record whose content is different.
_Avoid_: Project, Layout, Entwurf

**Design choice**:
A Design with the Release taken out — Template, colours, toggles. The half that **carries forward**:
the next Release to arrive wears what the last one touched wore, by every route it can arrive by, a
lookup or a Batch or a mixtape typed in from a shelf. Named separately because a Design cannot carry
forward, the Release in it being the one thing that never does.
_Avoid_: Style, Preset, Theme

**Measurements**:
The collector's hardware in millimetres: how big each Part is cut, because that is how big their
cartridges are. Set once, true of every Release, and so held by the app rather than by any Design —
which is the split the whole word exists for. The nine fields inside are the **Part dimensions**, the
Insert's five and the Label's four; Measurements is the thing that holds them, that a
collector sets, and that travels. A Page *count* is not one of them: every field here is a length,
which is what the name is for, and how many Pages a strip folds into is a fact about one record —
so it lives on the Design instead. Paper size and printable margin are measurements by the same
argument and have always been app-level; they stay in the Sheet configuration beside the choice of
which Parts to print. Measurements **travel in a project file and are applied when one is opened**,
the way paper and margin always have; an import says so when any of them changed.
_Avoid_: Settings, Preferences, Maße

### The Queue

**Queue**:
The Designs a collector is working through in one session, in the order they will be packed onto Sheets. One Queue, always; there is no second list.
_Avoid_: List, Batch, Warteschlange

**Queue Entry**:
One Design in the Queue, together with whether it still needs completing by hand. A lookup that found nothing leaves an Entry holding what was typed, never a hole — one missing album must not block the other nine.
_Avoid_: Item, Row, Eintrag

**Batch**:
One run of lookups that appends its Entries to the Queue. Failure is always per Entry, never per Batch.
_Avoid_: Queue, Job, Import, Stapel

### Identity

**Logo**:
The official MiniDisc logo, bundled as an optional asset and toggleable per Design. Belongs to Sony, not to this project.
_Avoid_: MD Logo, Sony Logo, Mark

**Mark**:
This project's own pictorial mark, built on a coarse module grid. Lives on screen and in the repository; never on a Part.
_Avoid_: Logo, Brand, Icon, Maskottchen

**Wordmark**:
The project's name set as type. A separate artifact from the Mark, and never set in a pixel font. Lives on screen and in
the repository; **never on a Part** — the Spine already carries the Logo, which Sony requires to be displayed
independently, and the name reads as a Sony sub-brand (ADR-0009).
_Avoid_: Logo, Schriftzug, Lettering

**Icon**:
A rendered placement of the Mark at a fixed pixel size — favicon, app icon, maskable icon. Not the Mark itself.
_Avoid_: Logo, Mark, Bildchen

**Sheet check**:
The collapsed verification of how the Parts packed onto Sheets — paper, printable margin, sheet count,
cutting guides — beside Export. A print check, not a preview: the Parts are the preview (ADR-0010).
_Avoid_: Preview, Vorschau, Sheet preview

**Assembled / Flat**:
The Insert's two representations. _Assembled_ is the closed booklet as it sits in the case — Front
Panel face-on, the 5.5 mm Spine beside it, the Inner Flap folded in behind and every Page after the
first folded behind that — and is the default. It is 73.5 mm wide whatever the Page count, which is
what keeps ADR-0010's one shared scale working. _Flat_ is the whole strip that actually prints:
152.5 mm at two Pages, 282.5 at four, which is wider than most viewports, so the band scrolls
sideways and the page does not. Orthographic in both cases; neither is a mockup of a case
(ADR-0008 rule 3).
_Avoid_: Folded, 3D, Mockup, Unfolded

**Register**:
The project's visual idiom: grid geometry in exactly one layer — the Mark — with contemporary technique everywhere else. Here "oldschool" means module grids, monospace typography, and one named 16-colour palette; it never means reproducing a historical interface.
_Avoid_: Retro, Theme, Skin, Look, Vibe
