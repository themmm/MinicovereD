# 09: Batch queue end-to-end

**What to build:** The queue handles several Releases at once: add Releases one search at a time, per-item fetch errors flagged for manual completion, reorder and remove, progress visible while the throttled fetcher runs — ending in packed multi-Release Sheets.

**Blocked by:** 03, 04.

**Status:** ready-for-agent

- [ ] A batch of five Releases resolves with progress; one deliberately failing lookup remains as an editable manual item while the others complete
- [ ] Reorder and remove work, and packed Sheets reflect the queue state and Part toggles
- [ ] End-to-end demo passes: batch → review step → packed multi-Release PDF export
