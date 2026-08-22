# 04: The Minimal Template

**What to build:** A third Template that sets type and nothing else — no artwork, no placeholder tint standing in for a missing image. It exists for hand-made Releases: a mixtape has no cover, no Discogs entry and no prose, so both existing Templates render it as a release whose artwork failed to download.

Minimal should make "no artwork" read as a decision. It is the Template with the most to gain from ticket 02, and is worth little without it.

**Blocked by:** 02, 03.

**Status:** ready-for-agent

- [ ] A Release with no artwork renders complete under Minimal — no gap, no placeholder
- [ ] Minimal draws its own tracklist Page, like the other two
- [ ] A Release *with* artwork under Minimal ignores it rather than half-using it
- [ ] Selecting Minimal is preserved across save, export and reload
