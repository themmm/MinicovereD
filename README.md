# MinicovereD

<p><img src="assets/mark.svg" width="96" alt="MinicovereD"></p>

Design and print MiniDisc J-Cards, Back Cards and cartridge Labels — print-accurate PDFs at exact millimetre size, offline-capable, fully client-side. No account, no server, no manual tracklist typing: release data and cover art come from MusicBrainz and the Cover Art Archive.

## The name, in two forms

Both spellings are correct and neither is a typo (ADR-0009).

**`MinicovereD`** is canonical: the capital **M** and the capital **D** bracket the word so that "MD"
reads out of it. The capitals are load-bearing — in lowercase the device disappears. Use this form for
the repository name, the PWA `name` and `short_name`, the Wordmark, this heading and the about dialog.

**`minicovered`** is the technical form: clone directories and shell paths, the npm package name, the
`client=minicovered-0.1.0` identifier sent to MusicBrainz, the `minicovered:` prefix on internal
errors, exported filenames, search queries, and any URL typed from memory.

Please do not "fix" one into the other.

## Highlights

- **Three Parts, one Sheet**: J-Card (Front Panel + Spine + Inner Flap), Back Card with tracklist, and the cartridge Label — laid out together on A4/Letter with cutting and fold guides.
- **Metadata on tap**: search MusicBrainz, auto-fill everything, override anything; full manual mode for mixtapes; batch queue for whole collections.
- **Print-accurate**: exact-mm PDF at 300 DPI, configurable printable margins, bin-packed sheets, and a calibration sheet to verify your printer with scissors and a ruler.
- **Local-first**: installable PWA that works offline; designs autosave in the browser and travel as a single project file.
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
plus the attribution manifest that keeps ADR-0003 honest.

## Status

Implementation runs ticket by ticket.

- Spec: [.scratch/minicovered-v1/spec.md](.scratch/minicovered-v1/spec.md)
- Tickets: [.scratch/minicovered-v1/issues/](.scratch/minicovered-v1/issues/)
- Domain glossary: [CONTEXT.md](CONTEXT.md) · Decisions: [docs/adr/](docs/adr/)

## License

MIT — see [LICENSE](LICENSE). Note: this project bundles the official MiniDisc logo as an optional asset; MiniDisc is a trademark of Sony (see [ADR-0004](docs/adr/0004-bundle-official-minidisc-logo.md)).
