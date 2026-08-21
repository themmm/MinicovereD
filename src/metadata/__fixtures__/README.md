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

MusicBrainz core data is in the public domain, so the JSON is redistributable.
Real cover art is not — the Cover Art Archive serves images under their own
copyright — so the artwork fixtures are generated placeholders at known
dimensions. They exist to exercise the header-reading in `image-size.ts` and the
bytes-to-data-URL path, neither of which cares what the picture is (ADR-0003).

To re-record, request the URLs above with an identifying `User-Agent`, one
request per second.
