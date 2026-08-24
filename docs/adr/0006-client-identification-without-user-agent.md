# Client identification to MusicBrainz without a User-Agent header

MusicBrainz requires that "each request sent to MusicBrainz needs to include a User-Agent header, with enough information in the User-Agent for us to contact the application maintainers". mdcovergen cannot comply literally: browsers forbid script from setting `User-Agent`, and ADR-0001 rules out the backend that would otherwise add it. The spec's phrase "identifying User-Agent per MusicBrainz policy" is therefore unmeetable as written for a purely client-side app.

What mdcovergen does instead: the MetadataAdapter still sets the header, so any host that permits it — the test suite today, a non-browser host later — sends it properly, while the browser transport strips forbidden header names so a stripped header cannot trigger a CORS preflight MusicBrainz would not answer. Every request additionally carries `client=mdcovergen-0.1.0`. That is a best-effort identifier, not a sanctioned substitute: MusicBrainz documents `client` only for POST submissions, and it says nothing about clients that cannot set a User-Agent. It does appear in their logs and leads back to this project, and the browser's automatic `Referer` identifies the deployment origin as well. Above all, the substantive purpose of the policy — not overloading a donation-funded service — is honoured strictly: every request in the app passes through one throttle at one request per second, with backoff and retry on 429 and 503.

Rejected: proxying requests through a server to set the header, which contradicts ADR-0001 and reintroduces the operating cost and the login barrier that decision exists to avoid; and dropping MusicBrainz, which is the feature. Consequence: if MusicBrainz ever objects to or blocks the app, the answer is a user-run proxy or a desktop host, not a change to the adapter — and this ADR is the record that the gap was known rather than overlooked.

## The identifier as it actually reads, 2026-08-24

The literal above is the one this ADR was written with, and it stays: it records what the decision sent
at the time it was made. What the app sends today is `client=minicovered-2.0.0`, and the header it still
sets for any host that permits one is `minicovered/2.0.0 ( https://github.com/themmm/MinicovereD )`. Two
things moved it — the rename in ADR-0009, which named this identifier's form while the version was still
`0.1.0`, and the version itself, which went to `2.0.0` after ticket 09 — a release step of its own
rather than part of one, which is how 1.1 and 2.0 both came to ship without it.

Neither is written into the adapter. `src/version.ts` imports the `version` field from `package.json` and
`src/metadata/metadata-adapter.ts` builds both strings from it, so no file under `src/` states the number
and nothing in the code can go stale when it moves. What can, and twice did, is prose — which is why
README carries a release checklist whose last step is to go and find every prose copy of the number
rather than to trust anyone to remember where they are.

None of the reasoning above changes. The argument is about a client that cannot set a User-Agent at all,
not about what that client calls itself.
