# 01: App shell & build pipeline

**What to build:** The installable, offline-capable PWA shell on TypeScript + Vite without a heavyweight UI framework. Bundled OFL fonts (broad glyph coverage including CJK via unicode-range subsets) render without network. An attribution dialog lists every bundled font and library with its license (ADR-0003). The build produces both the static PWA build and a single-file HTML artifact that opens by double-click (ADR-0002). UI language is English.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] PWA installs from a hosted URL on at least one desktop OS and loads offline after the first visit
- [ ] The single-file build opens by double-click and the app boots
- [ ] Bundled fonts render a Latin + umlaut + CJK test string with no network
- [ ] Attribution dialog lists all bundled fonts and libraries with licenses
- [ ] UI is English
