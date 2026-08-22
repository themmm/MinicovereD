# Discogs supplies credits, not prose, and asks for no key

A second metadata provider joins MusicBrainz: **Discogs**, queried once per already-resolved Release,
for **credits and release facts only** — `extraartists`, label with catalogue number, `country`,
`released`, `genres`, `styles`. Its `notes` field is deliberately not read. No API key is requested,
and no free-text field is offered alongside it.

MusicBrainz stays primary. Its tracklists are better, and the throttle, the retry behaviour and the
recorded fixtures in `MetadataAdapter` are all built around it (ADR-0006).

## Why a second provider at all

ADR-0012 gives the Insert Pages beyond the tracklist, and something has to go on them. A credits Page
reading *"RCA · PB 41447 · UK 1987 / Produced by Stock, Aitken & Waterman / Engineer — Mike Duffy /
Design — Me Company"* is genuine liner-note content, it is structured data so it typesets properly
rather than as a paragraph of unknown length, and it is the thing a real sleeve actually carries.

## Why not the `notes` field, which is what everyone reaches for first

Measured, not assumed. `GET api.discogs.com/releases/249504` returns a populated `notes`, and it reads:

> UK Release has a black label with the text "Manufactured In England" printed on it. […] Durations do
> not appear on the release. Runouts are etched, except 'B' stamp in variant '3'. 'MS' is encircled.

That is discographical annotation for collectors of *pressings* — matrix runouts, label variants,
copyright lines. It is not liner notes, and putting it on a Page is worse than leaving the Page out.
The field is populated often enough to look like a working feature and is almost never the thing
wanted, which is the most expensive kind of wrong.

The same reasoning rejects **a hand-typed prose field**. It was proposed and turned down: the tool
exists to stop people typing, the Insert's Pages are content-derived (ADR-0012), and a field that is
empty on every catalogued release and mandatory on every mixtape is a worse deal than two Pages.

## Why no API key

Probed rather than read from the backlog, which had recorded this as "Discogs + user API keys":

| | measured |
| --- | --- |
| reads without credentials | HTTP 200, no token |
| CORS | `access-control-allow-origin: *` |
| rate limit | 25 req/min unauthenticated, 60 with a free token |

A key is therefore an optional speed upgrade, not a requirement — and ADR-0001 is local-first with no
account, so a token field would be the first thing in this tool to send someone off to register on a
website. The limit does not justify that: Discogs is asked once per *resolved* Release, not once per
search, so a 25-Release batch costs one minute against the ~50 calls MusicBrainz already makes at
1/second. If waiting ever becomes real, an optional field is a small change; shipping one now is
permanent UI defending against a problem that does not exist.

The open CORS header is worth recording on its own. ADR-0006 documents that MusicBrainz's User-Agent
requirement cannot be met from a browser; Discogs has no equivalent obstacle, so this integration is
materially simpler than the one that already exists.

## Consequences

`Release` gains optional credit and release-fact fields. They are **additive and optional, so
`PROJECT_VERSION` is not bumped for them** — the same reasoning ticket 09 applied to the queue-entry
flag, and for the same reason: the reader refuses anything newer than it knows, so bumping would make
new files unreadable by the previous build for the sake of fields that are absent by default. The
version bump that does happen belongs to ADR-0012 and is unrelated.

`MetadataAdapter` grows a second source behind the same seam, tested the same way — recorded fixtures,
never the live network. Discogs is asked only after a Release resolves, so a Discogs failure degrades
a credits Page and never a lookup.

Discogs' terms and data licensing should be read before this ships, and any attribution obligation
added to the about dialog that ADR-0003 already maintains.
