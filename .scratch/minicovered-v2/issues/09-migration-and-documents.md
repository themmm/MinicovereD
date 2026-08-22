# 09: Migration to version 2, and the documents

**What to build:** `PROJECT_VERSION` becomes 2 and v1 files migrate on read rather than being refused. A v1 Design has exactly one J-Card and one Back Card, which is exactly a 2-Page Insert; the `jcard` and `back-card` toggles collapse to one `insert` toggle; Label measurements move out of the Design and into app settings (ticket 06).

v1.0.0 is public. The v1 rename shipped without a migration and told people to export first; doing that twice, the second time to a released version, is how a tool teaches people not to trust it with their work.

**The documents move together with the code:**

- **CONTEXT.md** gains **Insert** and **Page**, keeps Front Panel, Spine and Inner Flap unchanged as sections of the Insert, and marks **J-Card** and **Back Card** as retired v1 Parts rather than deleting them — six ADRs name them. The J-Card entry's `_Avoid_: Insert` is flipped.
- **README.md** stops promising three Parts and a Back Card.
- The v1 spec's **"case stickers"** backlog line is struck: the Label is the cartridge sticker and that is the whole of it.

**Blocked by:** 06, 08.

**Status:** blocked

- [ ] A v1 project file opens as a queue of 2-Page Inserts with nothing lost
- [ ] A version-2 file is refused by a version-1 reader, with the existing message
- [ ] Label measurements from a v1 file land in app settings, not on one Design
- [ ] CONTEXT.md, README.md and the v1 spec agree with the code
