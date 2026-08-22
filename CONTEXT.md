# MinicovereD

A tool for designing and printing cover inlays and disc labels for MiniDiscs. The glossary covers the domain from the metadata of a release through to the printed sheet.

## Language

### From Release to Sheet

**Release**:
The metadata unit that serves as the source for a Design: artist, album, tracklist, cover image, and supplementary info (e.g. year). Can be fetched automatically or created by hand (e.g. a mixtape).
_Avoid_: Album, Titel, Projekt

**Part**:
One of the three printable artifacts belonging to a Release: J-Card, Back Card, or Label.
_Avoid_: Seite, Element

**J-Card**:
The insert that slides into the front of the MiniDisc case. Consists of Front Panel, Spine, and Inner Flap.
_Avoid_: Insert, Einlage, Front Insert

**Front Panel**:
The 68 mm face of the J-Card visible through the case front.
_Avoid_: Cover, Vorderseite

**Spine**:
The 5.5 mm edge of the J-Card visible when the case is shelved. Carries artist, album, and the logo. Everything on it reads **bottom-to-top**, so a case standing on a shelf is read by tilting the head to the right; the logo turns with the type rather than sitting upright against it.
_Avoid_: Edge

**Back Card**:
The separate card that slides into the back of the MiniDisc case. Carries the tracklist.
_Avoid_: Back Insert, Rückseite, backline card

**Inner Flap**:
The 14 mm end of the J-Card folded inside the case to hold it in place.
_Avoid_: Flap

**Label**:
The sticker applied to the top of the MiniDisc cartridge. Rectangular; one corner may be cut diagonally to clear the cartridge's own cut corner, or left square to cover it. The notch is a choice, not part of the definition.
_Avoid_: Aufkleber, Sticker

**Sheet**:
A printable paper-size surface (default A4) on which one or more Parts are arranged with cutting guides. The unit that gets exported as a PDF.
_Avoid_: Seite, Druckseite

**Cutting Guide**:
A print-only mark on the Sheet that shows the boundaries of the Parts for cutting with scissors or a cutter.
_Avoid_: Schnittlinien

**Template**:
A named visual scheme that determines the layout, typography, and color logic of a Part. Parameterized per Design.
_Avoid_: Theme, Stil, Design

**Design**:
A Release together with the choices that turn it into Parts: Template, its parameters, and the Part dimensions. The unit that autosaves, that a project file carries, and that the Queue holds. A Release is what the album *is*; a Design is what this collector decided to print.
_Avoid_: Project, Layout, Entwurf

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
The J-Card's two representations. _Assembled_ is how it sits in the case — Front Panel face-on, the
5.5 mm Spine beside it, the Inner Flap folded behind — and is the default. _Flat_ is the 87.5 mm strip
that actually prints. Orthographic in both cases; neither is a mockup of a case (ADR-0008 rule 3).
_Avoid_: Folded, 3D, Mockup, Unfolded

**Register**:
The project's visual idiom: grid geometry in exactly one layer — the Mark — with contemporary technique everywhere else. Here "oldschool" means module grids, monospace typography, and one named 16-colour palette; it never means reproducing a historical interface.
_Avoid_: Retro, Theme, Skin, Look, Vibe
