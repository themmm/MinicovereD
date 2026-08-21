# The name is MinicovereD, and five of 0007's kill criteria are set aside for it

The working name `mdcovergen` is replaced by **MinicovereD**. The charm is a typographic one: the capital **M** and the capital **D** bracket the word, so that "MD" — short for MiniDisc — reads out of "Minicovered", while the word itself says plainly what the tool produces. The capitals are load-bearing. In lowercase the device disappears entirely and the name reads as an ordinary descriptive compound, which is not the name that was chosen.

This is a deliberate departure from ADR-0007, and this ADR records it as a departure rather than presenting the name as having met the standard. 0007 exists so the name would be "judged against a standard rather than rationalised after the fact"; the honest form of that is to name which parts of the standard were overridden.

**Passed:** 1 (no Sony trademark appears as a string component), 6 (no pronunciation guide needed — "mini-covered"), 7 (the token is its own: `minicovered` returns **0 repositories** on GitHub), 8 (nothing points at the cassette tooling), 10 (the name works in English), 11 (eleven characters, inside the `short_name` limit).

**Borderline, passed on the letter:** 9. The string neither leads with nor consists of `md`, and the Markdown-namespace problem the criterion exists to prevent does not arise — `minicovered` collides with nothing. But the name's entire charm *is* the `md` reading, so the criterion is satisfied mechanically and strained in spirit.

**Set aside:**

- **Criterion 2 — derived from the string of a registered mark.** `Mini` + a noun is MiniDisc's own construction, sharing its first two syllables and its shape. Worse for this criterion, the M/D device is the logo's device: read off the Commons artwork, the official MiniDisc logo sets **M and D as solid black with every other letter a hollow outline, precisely so that the initials "MD" read out of the wordmark**. MinicovereD reproduces that mechanism in a different medium. This is echo, not evocation.
- **Criterion 3 — reads as a Sony sub-brand.** It does, and for the same reason. ADR-0008 rejected the Sony ~1992 register on exactly this ground: it "duplicates the Logo's construction, reads as a Sony sub-brand."
- **Criterion 4 — needs explaining.** The bracket has to be pointed out. Readers who see the name in running text will not find it on their own.
- **Criterion 5 — the five-year test.** A capitalisation device lands once. It does not reward re-reading the way a pun with a shared referent does.
- **Criterion 12 — a single lowercase ASCII token.** Overridden outright, and this is the override with daily operational consequences (see below).

0007's register clause — *a pun with a shared referent, realised as a portmanteau* — is therefore no longer the governing rule for the project name. 0007 remains the record of the criteria, of the findability evidence, and of the rejected alternatives; its register requirement is superseded here.

## The trademark exposure, stated rather than mitigated

ADR-0004 already accepts one trademark risk: bundling the official MiniDisc logo as an optional asset, on the strength of the Commons PD-textlogo tag despite the trademark warning. This is a second risk of a different kind. There, a Sony asset is reproduced as a Sony asset, clearly attributed and used for the purpose it exists for. Here, the project's *own* identity borrows the construction of Sony's mark — the `Mini` prefix and the solid-initials device — and phonetic similarity is a core factor in the likelihood-of-confusion test that criteria 1–3 were written around. Sony DADC's artwork specification is also explicit that the logo must "Never [be combined] with other characters, figures or logos. Always display it independently," which sharpens the problem wherever the Wordmark and the Logo appear on the same surface.

No mitigation is claimed. If Sony ever objects, the answer is a rename, and this paragraph is the record that the exposure was understood at the time of the decision rather than discovered afterwards.

## Where the capitals survive, and where they do not

Because criterion 12 is overridden, the name has two forms and both will be seen constantly. Recording which is which prevents contributors from "fixing" one into the other.

**`MinicovereD` — the canonical form.** GitHub preserves the case a repository is created with and resolves case-variant URLs to it, so the repository name, the PWA `name` and `short_name`, the Wordmark, the README heading and the about dialog all carry the capitals.

**`minicovered` — the technical form, and not a misspelling.** Local clone directories, `cd` and shell paths, the `client=` identifier that ADR-0006 sends to MusicBrainz (which becomes `client=minicovered-0.1.0`, lowercase by convention), search queries, and any URL typed from memory. In all of these the device is absent and the name reads as a plain description.

The README must document both forms explicitly. A name whose meaning lives in its capitalisation is a name that carries no meaning in most of the places it appears, and that is the cost of the override, paid daily.

## Two consequences to resolve, not decided here

**The glossary.** The word *Cover* sits on the `_Avoid_` list of **Front Panel**. The name is not a glossary overload — *Cover* is a rejected term, not a defined one, and CONTEXT.md's own product line already reads "cover inlays and disc labels" — but the name now foregrounds a word contributors are told not to use for the Front Panel. The rule stands as written: the name operates at product level, and **Front Panel** remains the term for the 68 mm face.

**ADR-0008.** Its rejection paragraph now stands in tension with the name it has to carry. Rule 1 is unaffected — a solid/hollow contrast in the Wordmark is not a pixel font — but 0008 rejected the Sony ~1992 register partly for reading as a sub-brand, which the name now does. If the Wordmark is drawn with the M and D emphasised, that tension becomes a visible design decision and 0008 needs a follow-up note. If the Wordmark simply sets the name in type with ordinary capitals, it does not.

## Rejected

**The other two candidates proposed alongside it.** `MDesign` fails criterion 9 as squarely as any name could: it is the two tokens of `design.md`, the 109k-star repository that heads 0007's own evidence that `md` means Markdown, and it draws 154 repositories of Markdown and Material-Design noise. `MiniCover` is unavailable on findability grounds alone — **`lucaslorentz/minicover` has 215 stars** as a .NET code coverage tool, which is exactly the "known project that clogs the search" collision that availability was checked for. `minicovered` was free where `minicover` was not, and that is one reason the longer form is the one that survives.

**Ten candidates that satisfied all twelve criteria and were not chosen**, because the register they satisfy is opaque, and opacity is the property that was not wanted: `typesetlist` (typeset + setlist on the shared `set`; 0 repositories, no glossary or avoid-list edge), `covertracks` (covert + tracks, the seam yielding "cover tracks"; carries an anti-forensics connotation), `inkjetset`, `insetlist`, `disccovered` (disc + covered, the seam yielding "discovered" — the same device as the chosen name, realised without the `Mini` echo and without needing capitals), `cartwork`, `inlayout`, `discoverart`, `snipcase`, `caddigraphy`.

**Three whole classes killed by construction**, recorded so they are not re-proposed:

- *Existing words containing a domain segment*, killed by criterion 7 regardless of how good the pun is: `shellac` (shell ∩ the 78 rpm material; 103 repositories, 157 stars), `casefold` (35 repositories, 132 stars, plus Python's `str.casefold`), `cutlist` (224 repositories, 132 stars), `discard`, `coverdisc`, `typecase`, `gatefold`, `shutterbug`, `uncut`, `headliner`, `typecast`, `stereotype`, `minutiae`, `dither`, `trackrecord`, `composition`. `coversion` is the sharpest illustration: 280 repositories, and the hits are people misspelling "conversion".
- *Glossary overload*, the check that kills the best jokes: `rapsheet` on **Sheet**, `tempolate` on **Template**, `shutterrelease` on **Release**, `cuttingedge` on **Cutting Guide** and on *Edge*, `spinecraft` on **Spine**, `groovemark` on **Mark**, `disclabel` on **Label**.
- *Compounds and homophones rather than fusions*: `shutterfold` and `cutcorners` are compounds; `shellf`, `caddence`, `artridge` and `inkartridge` are audible homophones of their own source words, and `shellf` is additionally a prefix of `shellfire` (1225 stars), `shellfirm` (926) and `shellflip` (533).

**Phonetic echoes, rejected without argument** under criterion 2: `atractive`, `minidisco`, `netmdesign`, `himdrance`, and any `hi`-prefixed construction. Also rejected as derivations from live marks other than Sony's: `sharpiece` (Sharpie), `spinograph` (Spirograph), `digipak`, `letraset`.

## Consequence

The rename touches roughly eighteen files, the GitHub repository name (which redirects afterwards), and the `client=mdcovergen-0.1.0` identifier from ADR-0006, which becomes `client=minicovered-0.1.0`. npm is not a constraint: the package is `private` and ships as a PWA and a single-file HTML build (ADR-0002). No domain is registered. Findability is bought where 0007 said it would be — the GitHub `description` field, repository topics, and a listing on the MiniDisc Wiki software page — and that now carries more weight than it did, because the name no longer works as a pun that rewards a second look.
