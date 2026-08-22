# 07: Tracklist overflow & Unicode hardening

**What to build:** Tracklists longer than the Back Card fits flow into two columns and then shrink the type automatically, without dropping tracks. Unicode text — umlauts, accents, CJK — renders correctly through preview and PDF using the bundled fonts and system fallback.

**Blocked by:** 02.

**Status:** ready-for-agent

- [ ] A 25-track Release renders all 25 tracks, flowing into two columns
- [ ] A very long tracklist shrinks type instead of truncating
- [ ] A Japanese release title renders without replacement glyphs in preview and PDF
- [ ] Overflow behaviour (columns, shrink, no dropped tracks) is covered by SheetRenderer seam tests
