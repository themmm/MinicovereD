# v2.1 intake — what is wrong with the app

This is a **capture** document, not a plan. It exists to get complaints out of one head and onto disk
without them being argued with, fixed, or filtered on the way. Triage happens afterwards, in one pass,
against the whole list — because the order the complaints arrive in is not the order they matter in.

Entries can be written in German or English. Everything else in `.scratch/` is English; nobody has to
be consistent about this to be understood.

## How to use it

1. Run the app: `npm run dev`. Use it the way you actually use it — look a Release up, print a job,
   import an old file — rather than auditing it feature by feature. Friction shows up in a real task
   and hides in a checklist.
2. Every time something annoys you, **stop and write it down before fixing your workflow around it**.
   Working around an annoyance is how it stops being visible.
3. Screenshot it. Drop the file in `.scratch/minicovered-v2.1/shots/` and name it in the entry. This
   repo's most expensive lesson, twice over, is that a page can be wrong while every number about it
   is green — ticket 09's only real bug was found in a screenshot with 22 numeric checks passing.
4. **Do not classify while capturing.** "That's probably just taste" and "that's a known limitation"
   are triage verdicts, and a complaint that gets pre-filtered never reaches the list where its
   pattern would have been visible. The categories below are for later.

## The capture block

Copy this per complaint. Short is fine. An entry with no expectation stated is still worth having.

```
### N. <one line, in your own words>

- **What I see:**
- **What I expected:**
- **Where:** app screen / Part on screen / printed paper / project file / export
- **When:** every time · only with <Template, paper, Release, page count> · once, not reproduced
- **Shot:** shots/<file>.png
- **Cost:** (friction only) how many steps, and what I had to do more than once
```

The **Cost** line matters more than it looks. "The batch is slow" is not actionable; "a 25-Release
batch takes N seconds and I sit there" is. Same for clicks: name the number.

## Your entries

<!-- Nothing here yet. Fill during the intake session. -->

## Already known, so the overlap is visible

These are open items from `.scratch/minicovered-v2/HANDOVER.md`, sorted into the buckets below. If a
complaint lands on one of these, say so — that turns a new ticket into a **priority decision**, which
is cheaper. If a complaint contradicts one, that is the more interesting finding and it needs an ADR,
not a patch.

**Friction — the feature works, the path to it is the problem**

- The Insert's four case measurements — Inner Flap, Spine, Front Panel, height — **have no controls**
  and are reachable only by hand-editing a project file. `measurements.ts` argues they are what a
  *case* decides rather than a collector; the Page width got a control because 65 mm is a booklet
  number, not a case one.
- **A 25-Release Batch writes the whole project 25 more times.**
- `Release.notes` still holds MusicBrainz's `label · catalog-number` **beside** Discogs' own facts in
  `Release.credits` — two sources, one field, no separation.
- **A Letter collector can never print a credits Page.** They are told why, clearly, every time —
  which is honest and still leaves them unable to do the thing.

**Rendering and taste**

- **Minimal's headline is ellipsised in silence** while the Spine and the tracklist both warn about
  overflow. Arguably not taste at all: the inconsistency is the defect.
- **The credits Page's typography is thin** — one word of heading and a two-column flow. Honest, and
  not designed the way the tracklist Page is.
- **A short title leaves ~30 mm of blank paper** on Minimal's Front Panel.
- **The `.spec__note` cap snaps at both ends of the collapse.** `grid-template-rows: 1fr → 0fr` would
  animate both ways with no magic number, at the cost of a wrapper element.

**Cosmetic defect**

- **A short Release id renders as `MusicBrainz mb-1…mb-1`** — `workspace.ts:431` is
  `${id.slice(0, 4)}…${id.slice(-4)}`, which repeats itself under eight characters. Only reachable
  from a hand-edited file, so it is cosmetic and on untrusted input.

**Accepted costs — an ADR decided these on purpose**

Complaining about one of these is legitimate. It just does not produce a fix ticket; it produces an
ADR revision, and in this repo that means measurement rather than argument.

- **A shelved case no longer shows its tracklist.** The Back Card is gone and its list is a Page
  inside the booklet (ADR-0012). The paper gate was run before the code and one piece won.
- **Six Pages and a second strip are out of scope** — `MAX_INSERT_PAGES = 4`.
- **The calibration sheet cannot draw the Insert whole.** It draws 1:1 and never turns a figure, so a
  282.5 mm strip would be omitted at every margin. It prints the case end and one Page instead.
- **Paper-driven Page widths are rejected** (ADR-0014), which is upstream of the Letter/credits
  limitation above.
- **A Release restored from a project file does not fetch credits.** Decided on purpose, not
  overlooked: `requestCredits` at `workspace.ts:495` reads `discogsId` fine, but only a *lookup* calls
  it. Its comment gives the reason — reopening yesterday's work is not a lookup, and a queue of thirty
  Releases would put thirty requests on somebody else's rate limit the moment the app opened. Decided
  in a comment rather than an ADR, which makes it the cheapest of these to revisit: a "fetch credits"
  button costs nothing and asks for nothing unasked.

**Code hygiene, not user-visible**

- `LABEL_PAD = 2.5` (`templates/minimal.ts:395`) duplicates Classic's local `pad: Mm = 2.5`
  (`templates/classic.ts:115`).

## Triage, afterwards — five buckets and what each one costs

| Bucket | What it is | Treatment |
| --- | --- | --- |
| **Bug** | Behaves against its own spec | Failing test first, then fix |
| **Friction** | Works as specified; the path is the problem | Measure the cost, then design the path — this is where "inconvenient" lives |
| **Polish** | Renders or reads worse than it should | Specimens, not argument: render variants and look |
| **Accepted cost** | An ADR decided it deliberately | Reopen the ADR, on paper or on measurement. Not a patch |
| **New want** | Was never in scope | Scope decision before anything else |

Two rules that keep this honest:

- **Friction is the bucket most likely to be under-reported**, because a regular user has already
  built habits around it. If the list comes back with no friction entries, the intake was done as an
  audit rather than as use.
- **Taste is settled with specimens.** "The credits Page is thin" gets three rendered variants side
  by side, not a discussion. This repo already renders Parts to canvas and to PDF; use that.

## What comes out of this

The house pattern, same as v1 and v2:

- `.scratch/minicovered-v2.1/spec.md` — what 2.1 is, and what it deliberately is not.
- `.scratch/minicovered-v2.1/issues/NN-slug.md` — numbered tickets, blockers first.
- An ADR for anything that reverses a shipped decision. ADR-0012 reversing ADR-0005 is the model,
  including its gate: no renderer code until a printed artifact answered the questions.

## Start prompt for the intake session

Paste this into a fresh session:

```
Read .scratch/minicovered-v2.1/intake.md and .scratch/minicovered-v2/HANDOVER.md.

I am going to list things about MinicovereD that I do not like — functional friction as well as
looks. Capture them into intake.md under "Your entries" using the capture block. Do not triage,
do not argue, and do not propose fixes while I am still listing. Ask only the questions that
capture needs: where, when, what I expected.

When I say I am done, run the triage: sort every entry into the five buckets, name the overlaps
with the known list, and flag anything that contradicts an accepted cost. Then propose the 2.1
spec and a ticket order, blockers first.

Start the app first so I can point at real screens: npm run dev
```
