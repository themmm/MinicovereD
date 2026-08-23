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

## The terms, as read on 2026-08-23 — and how well

**There is no attribution obligation.** Discogs' API Terms of Use divide the API into *CC0 Data* and
*Restricted Data*. The CC0 Data is the database content — release titles, notes, dates, format,
track listings, barcodes and other identifiers, credits, versions — offered under CC0, which waives
copyright and asks for nothing, attribution included. The Restricted Data is everything else, chiefly
images, under a limited, personal, non-sublicensable, non-transferable, non-exclusive, revocable
licence. **This app reads only CC0 Data**: `GET /releases/{id}` and no `images`, ever.

Discogs is credited in the about dialog anyway, and the entry says in as many words that the credit is
a courtesy. A collector deserves to know where a request went even when nobody requires telling them.

Two things the same reading settles that this ADR's table did not:

| | as documented |
| --- | --- |
| rate limit, counted how | a moving average over a sixty-second window; 429 when it is exceeded |
| `/database/search` | **authentication required** |

The second one is load-bearing and was not obvious. A Discogs release cannot be *searched* for
without credentials, so the only way to reach one without the API key this ADR refuses is to follow a
link that already exists — which is why the implementation asks MusicBrainz for `inc=url-rels` and
reads the Discogs address out of the release's url relationships. The cost, accepted: a pressing
MusicBrainz has not linked has no credits, and that is most pressings.

**How well founded this is, stated plainly because the rest of this ADR was measured and this was
not.** `www.discogs.com/developers` and the API Terms of Use article both answered **HTTP 403** to
this project's tooling, so the terms were read *at second hand* — from search-engine extracts
quoting those two pages, and from the `python3-discogs-client` documentation for the authentication
boundary. Nothing above is a quotation from the page itself. That is enough to justify a courtesy
credit and to justify not building an API-key field; it is **not** enough to rely on if anything ever
turns on the CC0 clause. Re-read it from the page before it does.
