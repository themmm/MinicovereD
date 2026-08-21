# mdcovergen

A tool for designing and printing cover inlays and disc labels for MiniDiscs. The glossary covers the domain from the metadata of a release through to the printed sheet.

## Language

**Release**:
The metadata unit that serves as the source for a design: artist, album, tracklist, cover image, and supplementary info (e.g. year). Can be fetched automatically or created by hand (e.g. a mixtape).
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
The sticker that gets applied to the top of the MiniDisc cartridge. Rectangular, with one diagonally cut corner.
_Avoid_: Aufkleber, Sticker

**Sheet**:
A printable paper-size surface (default A4) on which one or more Parts are arranged with cutting guides. The unit that gets exported as a PDF.
_Avoid_: Seite, Druckseite

**Cutting Guide**:
A print-only mark on the Sheet that shows the boundaries of the Parts for cutting with scissors or a cutter.
_Avoid_: Schnittlinien

**Template**:
A named visual design that determines the layout, typography, and color logic of a Part. Parameterizable per Release.
_Avoid_: Theme, Stil
