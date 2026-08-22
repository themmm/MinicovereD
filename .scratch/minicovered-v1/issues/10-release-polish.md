# 10: Release polish — offline artwork, empty states, release artifact

**What to build:** Offline caching of fetched artwork so previously built designs render and export without network; an empty/onboarding state that walks the user to their first Release; final attribution completeness check (ADR-0003); the single-file HTML artifact produced as a release deliverable.

**Blocked by:** 05, 06, 07, 08, 09.

**Status:** ready-for-agent

- [ ] After one online session, the app renders and exports previously fetched designs including artwork while fully offline
- [ ] First launch shows an empty state that leads to the first Release
- [ ] The attribution dialog is complete for everything that ships
- [ ] The single-file HTML artifact builds and boots by double-click
