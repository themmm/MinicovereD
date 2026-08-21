# Naming criteria and register, fixed before the name

`mdcovergen` is a working name and will be replaced. This ADR records the criteria a candidate has to meet, decided before any candidate existed, so that the eventual name is judged against a standard rather than rationalised after the fact. The name itself is deliberately not decided here.

The primary audience is MiniDisc collectors; FOSS readers are a secondary audience for the repository with no veto over the name. The name may therefore be opaque to outsiders, provided the line beneath it resolves it in one sentence. The register is **a pun with a shared referent, realised as a portmanteau**: the referent supplies the joke, the fusion supplies a unique token. Domain vocabulary is admissible up to format level (disc, cartridge, shutter, spine, j-card), but no Sony trademark may be a component of the name.

One name carries both charm and findability; there is no descriptive package name alongside a separate display name. Findability is bought elsewhere — the GitHub `description` field, repository topics, and a listing on the MiniDisc Wiki software page. The evidence is that a descriptive name buys nothing here: `minidisc-cover`, `minidisc-cover-generator`, `minidisc-cover-designer`, `minidisc-label-maker`, `minidisc-label-generator`, `MiniDisc-Labels-Batch-App`, `Minidisc-label-creation-tool` and `Minidisc-Label-Template` all sit at four stars or fewer, while the projects with traction are named opaquely — `webminidisc` (343), `platinum-md` (273), `ElectronWMD` (136), `netmd-js` (43). GitHub search reads the description field, so an opaque name is found anyway.

Kill criteria. A candidate is out if it:

1. contains a Sony trademark as a component — MiniDisc, ATRAC / ATRAC3 / ATRAC3plus / ATRAC Advanced Lossless (Sony's own trademark notice), NetMD (registered, USPTO serial 76277680), Hi-MD;
2. is derived from the *string* of a registered mark — a letter swapped, a suffix added, the same syllable sequence. Phonetic similarity is a core factor in the likelihood-of-confusion test, and a pun does not cure it; the rule is **evoke, don't echo**;
3. reads as a Sony sub-brand;
4. needs explaining — if the README would have to carry a sentence unlocking the joke, it is a footnote, not a joke;
5. fails the five-year test: a referential joke that only lands once;
6. needs a pronunciation guide (mondegreens are excluded; this project is read, not spoken);
7. is a generic word with no token of its own — `spine` and `toc` are taken on npm, on GitHub and as domains;
8. is confusable with the cassette tooling next door, specifically `davideusz/cassette-jcard-maker` and `ed7n/jcard-template` — note that *J-card* is a 1970s cassette term MiniDisc inherited, so it points at cassettes first;
9. leads with or stands on `md`. In developer namespaces `md` means Markdown, overwhelmingly: `design.md` (109k), `mdb-ui-kit` (24k), `agents.md` (24k), `mdBook` (22k), `mdx` (20k), with no MiniDisc result among them. Fused inside a portmanteau is fine; leading is not;
10. only works in German. The scene is English-speaking, so the joke has to land in English;
11. exceeds roughly twelve characters — the PWA `short_name` is truncated under the installed app icon (practical limit, not a documented one);
12. is not a single lowercase ASCII token: no hyphen, no digits standing in for letters, no special characters.

Rejected: keeping `mdcovergen`, which is opaque like a pun without the payoff and buried in the Markdown namespace besides; and splitting a descriptive package name from a charming display name, which fails specifically because there is no domain — the repository name *is* the URL people paste, so the descriptive half would become the real name and the pun would never take.

Consequence: renaming touches about eighteen files, the GitHub repository name (which redirects afterwards), and the `client=mdcovergen-0.1.0` identifier that ADR-0006 sends to MusicBrainz. npm is not a constraint: the package is `private` and is distributed as a PWA and a single-file HTML build (ADR-0002). No domain will be registered.
