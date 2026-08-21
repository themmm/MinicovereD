# 04: MusicBrainz/CAA adapter & search flow

**What to build:** The MetadataAdapter seam: MusicBrainz release search, release + tracklist fetch, Cover Art Archive artwork, normalized into the Release domain type; 1 request/second throttled queue with an identifying User-Agent per MusicBrainz policy; no API key. Plus the search UI: pick a result, auto-fill artist, album, year, tracklist, and cover art, with a review step in which every field stays editable.

**Blocked by:** 02.

**Status:** ready-for-agent

- [ ] Searching artist/album shows results; selecting one auto-fills all metadata and the cover art
- [ ] Every auto-filled field is editable before rendering
- [ ] Adapter tests against recorded HTTP fixtures are green (search hit, search miss, release with tracklist, artwork, per-item failure) and never touch the live network
- [ ] A failing item is reported per-item while the rest of the queue resolves
- [ ] The throttled queue processes completely with visible progress
