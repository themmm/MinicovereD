# 05: Discogs credits (ADR-0013)

**What to build:** A second source behind `MetadataAdapter`, asked once per already-resolved Release, for credits and release facts: `extraartists`, label with catalogue number, `country`, `released`, `genres`, `styles`. No API key, no `notes`, no free-text field.

Discogs needs no credentials for reads and sends `access-control-allow-origin: *`, so it has none of the User-Agent obstacle ADR-0006 records for MusicBrainz. Rate limit is 25/min unauthenticated. A Discogs failure must degrade a credits Page and never a lookup.

The new Release fields are additive and optional, so **`PROJECT_VERSION` is not bumped** — the reasoning ticket 09 of v1 applied to the queue-entry flag.

**Blocked by:** nothing.

**Status:** ready-for-agent

- [ ] Credits arrive for a resolved Release and are overridable by hand, like every other field
- [ ] A Discogs timeout or 429 leaves the Release intact and the lookup successful
- [ ] Recorded fixtures only in tests; the live network is never touched
- [ ] `notes` is not read, and no key field exists anywhere in the UI
- [ ] Discogs' terms and data licence are read, and any attribution obligation is added to the about dialog
