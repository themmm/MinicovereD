# 06: Measurements are settings, design is per Release

**What to build:** Split `ReleaseDesign`. Measurements — Label size, notch, notch size, and later Page width and default Page count — become app-level settings a collector sets once, because they describe that collector's cartridges and printer and are true of every Release. Template, colours and toggles stay per Design and carry forward from the last Release touched, on every route.

This removes the v1 asymmetry nobody could pick a rule for: a single lookup inherited the on-screen design (`workspace.ts`, `{ ...selected()?.design, release: found }`), while a Batch entry and a by-hand Release both got `DEFAULT_DESIGN`. The reason no rule fit is that the object bundled two kinds of choice with opposite correct defaults.

First ticket of 2.0, and the first one to touch the file format.

**Blocked by:** nothing, but ships in 2.0.

**Status:** ready-for-agent

- [ ] Nudging the Label to 34.6 × 52.4 applies to every Release, present and future, without re-entry
- [ ] A looked-up Release, a Batch entry and a by-hand Release all start with the same Template and colours
- [ ] Settings survive reload and travel in the project file
- [ ] Migration from a v1 file is covered — see 09
