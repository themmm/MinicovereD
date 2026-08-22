# 08: Persistence — autosave & project files

**What to build:** Autosave of all Releases, designs, and settings to IndexedDB; project file export/import as a single JSON with embedded images, so designs move between devices and survive as backups (ADR-0001).

**Blocked by:** 02.

**Status:** ready-for-agent

- [ ] Reloading the app restores the complete queue and all designs
- [ ] An exported project file imported in a fresh browser profile reproduces identical renders
- [ ] A corrupt or partial project file fails gracefully with a readable message, without destroying existing autosaved state
