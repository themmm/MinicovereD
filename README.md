# MinicovereD

<p><img src="assets/mark.svg" width="96" alt="MinicovereD"></p>

Design and print MiniDisc case Inserts and cartridge Labels — print-accurate PDFs at exact millimetre size, offline-capable, fully client-side. No account, no server, no manual tracklist typing: release data and cover art come from MusicBrainz and the Cover Art Archive, credits and pressing facts from Discogs.

## The name, in two forms

Both spellings are correct and neither is a typo (ADR-0009).

**`MinicovereD`** is canonical: the capital **M** and the capital **D** bracket the word so that "MD"
reads out of it. The capitals are load-bearing — in lowercase the device disappears. Use this form for
the repository name, the PWA `name` and `short_name`, the Wordmark, this heading and the about dialog.

**`minicovered`** is the technical form: clone directories and shell paths, the npm package name, the
`client=minicovered-2.0.0` identifier sent to MusicBrainz, the `minicovered:` prefix on internal
errors, exported filenames, search queries, and any URL typed from memory.

Please do not "fix" one into the other.

## Highlights

- **Two Parts, one Sheet**: the **Insert** — one strip carrying an Inner Flap, a Spine and then two or four Pages, the first of which is the Front Panel the case window shows, folded into a booklet that sits in the front of the case — and the cartridge **Label**, laid out together on A4/Letter with cutting and fold guides, a dash pattern per kind of fold ([ADR-0012](docs/adr/0012-the-insert.md)).
- **A booklet, not a card**: the tracklist gets a Page of its own, credits get another, and the odd Page out reprints the artwork as a back cover. How many Pages comes from what the record has to say, and the collector can override it for one Release.
- **Three Templates**: Classic (artwork to three edges, type on paper below), Full-bleed (artwork edge to edge, type as an overlay) and Minimal (type only, for mixtapes). Each names its own display, text and Spine faces out of six — five bundled OFL voices plus Noto Sans, which is also what every stack falls back to, with Noto Sans JP behind it for CJK.
- **Metadata on tap**: search MusicBrainz, auto-fill everything, override anything; credits and release facts from Discogs, no API key needed; full manual mode for mixtapes; batch queue for whole collections.
- **Print-accurate**: exact-mm PDF at 300 DPI, configurable printable margins, bin-packed sheets — a strip longer than the paper is wide is turned 90° rather than refused ([ADR-0014](docs/adr/0014-rotate-the-part-not-the-sheet.md)) — and a calibration sheet to verify your printer with scissors and a ruler.
- **Local-first**: installable PWA that works offline; designs autosave in the browser and travel as a single project file. A project saved by v1.x still opens, its J-Card and Back Card read as one Insert.
- **FOSS-only** dependencies and assets, licenses honored.

## Development

```sh
npm install
npm run dev              # local dev server
npm test                 # unit tests
npm run typecheck
npm run build            # typecheck + dist/pwa + dist/singlefile
```

`npm run build:pwa` produces the hosted, installable, offline-capable build; `npm run build:singlefile`
produces the self-contained `index.html` that opens by double-click (ADR-0002). Both bundle the same
OFL fonts, so neither needs the network. To host under a sub-path, set `MINICOVERED_BASE`
(e.g. `MINICOVERED_BASE=/minicovered/ npm run build:pwa`).

Tests live at the three seams the spec names — SheetRenderer (geometry via the layout model),
SheetPacker (rectangle sets) and MetadataAdapter (recorded HTTP fixtures, never the live network) —
with the pure modules either side of them carrying their own, and three suites that guard claims no
seam can: the attribution manifest that keeps ADR-0003 honest, the print quarantine that keeps the
app's chrome off the paper (ADR-0008 rule 9), and the built artifacts. The artifact checks and the
two attribution checks that read `dist/` **skip without a build**, so run `npm run build` before
trusting a green suite on the single-file build's 4 MiB ceiling.

### Releasing

Both 1.1 and 2.0 shipped before anyone bumped the version, which is why the step is written down here
rather than remembered:

1. `npm run build`, then `npm test`. The artifact checks and the two attribution checks that read
   `dist/` skip without a build, so a green suite means less before one.
2. `npm version <x.y.z> --no-git-tag-version`. Nothing else needs editing for the number to take
   effect — `src/version.ts` imports that field and the MetadataAdapter builds `client=` and the
   User-Agent from it — but bumping it changes what MusicBrainz is told the client is
   ([ADR-0006](docs/adr/0006-client-identification-without-user-agent.md)), which is why this is a
   release decision and not bookkeeping.
3. Update the prose copies of the number — the build reaches none of them, and there is more than
   one. `grep -rn <the-old-version> README.md docs/adr/` lists them: in this file, the identifier
   under [The name, in two forms](#the-name-in-two-forms) and the paragraph that closes
   [Status](#status). ADR-0006 states it too, under a dated heading — append a new dated section
   there rather than editing a section that is already dated.

## Status

Implementation runs ticket by ticket, and **v2 is complete** — both of its releases. 1.1 was additive
and broke no saved file: bundled typefaces, Classic's artwork bleeding three edges, a tracklist Page
per Template, Minimal, Discogs credits.
2.0 is the format break: the J-Card and the Back Card became one folded **Insert**
([ADR-0012](docs/adr/0012-the-insert.md)), measurements became the collector's settings instead of one
Release's design, and `SheetPacker` learned to turn a Part rather than the Sheet
([ADR-0014](docs/adr/0014-rotate-the-part-not-the-sheet.md)).

Project files are **format version 2**, and a version-1 file still opens rather than being refused:
its `jcard` and `back-card` toggles collapse to one Insert, its J-Card measurements become the
Insert's first four, and the Label it kept per Release becomes the project's. How many Pages the
Insert folds into is derived from the content rather than read from the file, so a Release with
credits or with a tracklist too long for one Page opens as a four-Page booklet whichever version
wrote it. Nothing has to be exported first.

- Spec: [.scratch/minicovered-v2/spec.md](.scratch/minicovered-v2/spec.md)
- Tickets: [.scratch/minicovered-v2/issues/](.scratch/minicovered-v2/issues/)
- Domain glossary: [CONTEXT.md](CONTEXT.md) · Decisions: [docs/adr/](docs/adr/)

v1's own spec and tickets are kept as the record of what shipped first, and of the three-Part
arrangement ADR-0005 chose and [ADR-0012](docs/adr/0012-the-insert.md) reversed.

- Spec: [.scratch/minicovered-v1/spec.md](.scratch/minicovered-v1/spec.md)
- Tickets: [.scratch/minicovered-v1/issues/](.scratch/minicovered-v1/issues/)

The last release step has been taken: **`package.json` says `2.0.0`.** Both 1.1 and 2.0 completed
without a version bump, so it was made afterwards, on its own — a decision about what a third party
sees rather than a ticket. That field is the single source `src/version.ts` reads, and
`src/metadata/metadata-adapter.ts` builds both identifiers from it, so no source file states the number:
MusicBrainz now sees `client=minicovered-2.0.0` and, where a host permits the header,
`minicovered/2.0.0`.

## License

MIT — see [LICENSE](LICENSE). Note: this project bundles the official MiniDisc logo as an optional asset; MiniDisc is a trademark of Sony (see [ADR-0004](docs/adr/0004-bundle-official-minidisc-logo.md)).
