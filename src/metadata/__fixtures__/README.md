# Recorded HTTP fixtures

Real responses, recorded once so the MetadataAdapter tests never touch the live
network. Any URL the adapter asks for that is not recorded fails the test loudly
— that is what makes "never live" a property of the suite rather than a promise.

| File | Recorded from |
| --- | --- |
| `search-hit.json` | `musicbrainz.org/ws/2/release?query=artist:"Daft Punk" AND release:"Discovery"` (trimmed to three results) |
| `search-miss.json` | the same endpoint with a query that matches nothing |
| `release-with-tracklist.json` | `musicbrainz.org/ws/2/release/5ad66522-…?inc=artist-credits+recordings+labels` |
| `cover-art-front.jpg` | **not** a real cover: a generated 500 × 500 JPEG |
| `cover-art-front.png` | **not** a real cover: a generated 240 × 320 PNG |
| `discogs-release-1.json` | a real Discogs release response for release 1 (The Persuader — *Stockholm*), taken from the published test fixtures of the MIT-licensed `ricbra/php-discogs-api` client rather than from a live call, and transcribed key by key rather than copied whole |
| `discogs-release-249504.json` | **hand-authored, not recorded** — see below |

MusicBrainz core data is in the public domain, so the JSON is redistributable.
Real cover art is not — the Cover Art Archive serves images under their own
copyright — so the artwork fixtures are generated placeholders at known
dimensions. They exist to exercise the header-reading in `image-size.ts` and the
bytes-to-data-URL path, neither of which cares what the picture is (ADR-0003).

To re-record, request the URLs above with an identifying `User-Agent`, one
request per second.

## The two Discogs fixtures, and why one of them is written by hand

`discogs-release-249504.json` is the release ADR-0013 argues from, assembled
from the two measurements that ADR records of
`GET api.discogs.com/releases/249504`: its `notes` text, quoted there verbatim
including the ADR's own elision, and the label, catalogue number, country, year
and credits its example credits block names. `genres` and `styles` are added so
that both arrays are exercised. It is written rather than recorded because
recording it means a live request, which is the one thing this suite must not
make — and because what it is *for* is the `notes` field: the test that proves
nothing from Discogs' `notes` reaches a Release needs a `notes` full of matrix
runouts, and that is exactly the text ADR-0013 measured.

`discogs-release-1.json` is there for the shapes a hand-written fixture would
not think of, and every one of them is real: a partial date (`1999-03-00`, a
March nobody recorded the day of), a role carrying Discogs' bracketed qualifier
(`Music By [All Tracks By]`), an `entity_type` that is a string holding a
number, and an `anv` present but empty on every credit. It deliberately keeps
several keys the adapter cannot see — `notes`, `year`, `artists`, `uri`,
`data_quality` — because a fixture that holds only what the parser reads cannot
show that the parser ignores the rest.

**Redistributable, and on what grounds.** Discogs' API terms put the database
content under CC0, so this JSON travels the way the MusicBrainz JSON above does;
`docs/adr/0013` records how well that reading is founded, and it is a second-hand
reading rather than a measured one. Nothing here is Restricted Data under those
terms: no images, and no `images` block — this adapter never asks for one.

**MusicBrainz's `url-rels` block is not recorded either.** The Discogs id comes
from a `discogs` url relationship on the MusicBrainz release
(`inc=url-rels`), and `release-with-tracklist.json` above was recorded before
this adapter asked for one. Rather than editing a recorded response, the
relations array is written in `metadata-adapter.test.ts`, next to the test that
reads it, carrying only the field the adapter actually looks at.
