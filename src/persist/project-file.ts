import { hasCredits } from '../domain/credits.ts';
import { DEFAULT_MEASUREMENTS } from '../domain/measurements.ts';
import type { Measurements } from '../domain/measurements.ts';
import { A4, DEFAULT_PRINTABLE_MARGIN_MM, PAPER_SIZES } from '../domain/paper.ts';
import type { PaperSize } from '../domain/paper.ts';
import {
  DEFAULT_PART_DIMENSIONS,
  LABEL_SIZE_RANGE,
  MAX_INSERT_PAGES,
  PAGE_WIDTH_RANGE,
  PART_KINDS,
} from '../domain/parts.ts';
import type { InsertDimensions, LabelDimensions, PartDimensions, PartKind } from '../domain/parts.ts';
import type { Artwork, Credit, Credits, Release, Track } from '../domain/release.ts';
import { readyEntry, unfinishedEntry } from '../queue/release-queue.ts';
import type { QueueEntry } from '../queue/release-queue.ts';
import { safeLogoColor } from '../render/minidisc-logo.ts';
import { DEFAULT_DESIGN_CHOICE, DEFAULT_TEMPLATE_PARAMS, TEMPLATES } from '../render/sheet-renderer.ts';
import type { ReleaseDesign, SheetConfig, TemplateId, TemplateParams } from '../render/sheet-renderer.ts';

/**
 * The project file: one JSON document holding every Release, its design and the
 * Sheet configuration, with artwork embedded, so a project moves between
 * devices as a single file and survives as a backup (ADR-0001).
 *
 * Reading one is the app's only untrusted input. It never throws and never
 * half-applies: either a whole project comes back, or a sentence saying why not
 * — because the alternative is destroying autosaved state with a bad file.
 */

export const PROJECT_FORMAT = 'minicovered-project';

/**
 * Version 2: the measurements left the Designs, and the J-Card and the Back Card
 * became the Insert.
 *
 * A version-1 file carries a `dimensions` block inside every design, because
 * v1 gave each Release its own Part sizes, and inside it a `jcard` block and a
 * `backCard` one. A version-2 file carries one `measurements` block for the
 * project with an `insert` block inside it. `readProjectFile` still reads the old
 * shapes — see `readMeasurements`, `readInsert` and `readParts` — but it writes
 * only the new ones, and that is the break: this is the first version whose files
 * a v1.x build refuses outright rather than misreading.
 *
 * Refusing is the intended half. The unintended half is what an older reader
 * does with anything *additive*, which it cannot refuse because it cannot see
 * it: `readTemplateId` in v1.0 falls back to `'classic'` for a Template it does
 * not know, so a v1.0 build opening a Minimal file quietly rewrites the design
 * rather than saying it cannot read it. That is the price the additive rule
 * charged for the whole of 1.1, and bumping the version is what stops it
 * accruing further.
 */
export const PROJECT_VERSION = 2;

export interface Project {
  /** The queue as it stood, in order, entries still needing a hand included. */
  readonly entries: readonly QueueEntry[];
  readonly sheet: SheetConfig;
  /** The collector's measurements, one set for the whole project. */
  readonly measurements: Measurements;
}

export type ProjectReadResult =
  | { readonly ok: true; readonly project: Project }
  | { readonly ok: false; readonly error: string };

/** Below this a Sheet has no printable area worth the name. */
const MAX_MARGIN_MM = 40;

/** No Part is smaller than a fold or larger than the biggest paper this app prints. */
const MIN_PART_MM = 1;
const MAX_PART_MM = 300;

export function writeProjectFile({ entries, sheet, measurements }: Project): string {
  return `${JSON.stringify(
    {
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      savedAt: new Date().toISOString(),
      designs: entries.map(({ design, status }) => ({
        release: design.release,
        templateId: design.templateId,
        params: design.params,
        // Written only when the collector set one, so a project whose Inserts
        // follow their content reads the same as one written before the override
        // existed — and reopens deriving the count rather than freezing today's
        // answer into the file.
        ...(design.pageCount === undefined ? {} : { pageCount: design.pageCount }),
        // Written only when true, so a project of ordinary Releases reads the
        // same as one written before this flag existed. The reason the lookup
        // failed is deliberately not written; see QueueEntry.error.
        ...(status === 'failed' ? { needsCompleting: true } : {}),
      })),
      sheet: { paperId: sheet.paper.id, marginMm: sheet.marginMm, parts: sheet.parts },
      // Beside the Sheet rather than inside it: paper and margin describe the
      // print job, these describe the cartridges the Parts have to fit.
      measurements: { dimensions: measurements.dimensions },
    },
    null,
    2,
  )}\n`;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const asNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const asBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

function readTracks(value: unknown): Track[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((track, index) => {
    // A saved project has to reproduce its own design, and from v1.1 the Back
    // Card sets a duration column — a reader that dropped the times would
    // reopen the file as a different Part. Anything that is not a positive
    // number of milliseconds is no time at all rather than a `0:00`, exactly as
    // the adapter treats it; a project file is not trusted to be sane.
    const lengthMs = asNumber(track['lengthMs'], 0);
    return {
      position: Math.max(1, Math.round(asNumber(track['position'], index + 1))),
      title: asString(track['title']),
      ...(lengthMs > 0 ? { lengthMs } : {}),
    };
  });
}

function readArtwork(value: unknown): Artwork | undefined {
  if (!isRecord(value)) return undefined;
  const dataUrl = asString(value['dataUrl']);
  const widthPx = asNumber(value['widthPx'], 0);
  const heightPx = asNumber(value['heightPx'], 0);
  // Only a data URL: a project file must not be able to point the app at a
  // remote address, and a zero-sized image divides by zero the moment it is
  // placed on a Part.
  if (!dataUrl.startsWith('data:image/') || widthPx <= 0 || heightPx <= 0) return undefined;
  return { dataUrl, widthPx, heightPx };
}

/**
 * A Credits block out of a file, which is untrusted input like everything else
 * in one.
 *
 * A credit needs a name and may have no role, which is exactly how the form
 * reads one — a file and a keystroke produce the same block. A block with
 * nothing left in it after that is no block at all, the same answer
 * `fetchCredits` gives for a Discogs entry with nothing in it, so that a file
 * cannot arrive carrying an empty block that makes every later "have the
 * credits arrived?" answer yes.
 */
function readCredits(value: unknown): Credits | undefined {
  if (!isRecord(value)) return undefined;

  const text = (key: string): string => asString(value[key]).trim();
  const strings = (raw: unknown): string[] =>
    (Array.isArray(raw) ? raw : []).map((entry) => asString(entry).trim()).filter((entry) => !!entry);

  const people: Credit[] = (Array.isArray(value['people']) ? value['people'] : [])
    .filter(isRecord)
    .map((credit) => ({
      role: asString(credit['role']).trim(),
      name: asString(credit['name']).trim(),
    }))
    .filter((credit) => !!credit.name);

  const credits: Credits = {
    people,
    ...(text('label') ? { label: text('label') } : {}),
    ...(text('catalogNumber') ? { catalogNumber: text('catalogNumber') } : {}),
    ...(text('country') ? { country: text('country') } : {}),
    // Four digits or nothing, which is what `Credits.year` says it is and what
    // `yearOf` enforces on the way in from Discogs. `Release.year` beside it is
    // free text on purpose — "n/a" and a reissue year are both real there — but
    // this one is a fact about a pressing, and a file is not trusted to agree.
    ...(/^\d{4}$/.test(text('year')) ? { year: text('year') } : {}),
    genres: strings(value['genres']),
    styles: strings(value['styles']),
  };
  return hasCredits(credits) ? credits : undefined;
}

/** A Release needs an id and a tracklist to be one; everything else may be blank. */
function readRelease(value: unknown, index: number): Release | string {
  if (!isRecord(value)) return `Release ${index + 1} is not a Release.`;

  const id = asString(value['id']).trim();
  if (!id) return `Release ${index + 1} has no id.`;
  if (value['tracks'] !== undefined && !Array.isArray(value['tracks'])) {
    return `Release ${index + 1} has a tracklist that is not a list.`;
  }

  const year = asString(value['year']).trim();
  const notes = asString(value['notes']).trim();
  const artwork = readArtwork(value['artwork']);
  const credits = readCredits(value['credits']);
  // Held to the same shape `discogsIdOf` requires on the way in from
  // MusicBrainz — a whole positive number that is exactly itself — because the
  // two are the same field and a file is the untrusted one of the two sources.
  // Nothing puts this one in a URL today; the day something does, it will not
  // have to ask whether a file could have made it a fraction.
  const discogsId = asNumber(value['discogsId'], 0);
  return {
    id,
    artist: asString(value['artist']),
    album: asString(value['album']),
    ...(year ? { year } : {}),
    ...(notes ? { notes } : {}),
    tracks: readTracks(value['tracks']),
    ...(artwork ? { artwork } : {}),
    ...(Number.isSafeInteger(discogsId) && discogsId > 0 ? { discogsId } : {}),
    ...(credits ? { credits } : {}),
  };
}

function readParams(value: unknown, version: number): TemplateParams {
  const source = isRecord(value) ? value : {};
  // Colours from a file end up substituted into SVG markup, so they get the
  // same validation the bundled logo uses. Anything that fails it falls back to
  // this app's default rather than to the validator's own black.
  const colour = (key: keyof TemplateParams, fallback: string): string => {
    const raw = asString(source[key], fallback);
    return safeLogoColor(raw) === raw ? raw : fallback;
  };

  return {
    paperColor: colour('paperColor', DEFAULT_TEMPLATE_PARAMS.paperColor),
    inkColor: colour('inkColor', DEFAULT_TEMPLATE_PARAMS.inkColor),
    accentColor: colour('accentColor', DEFAULT_TEMPLATE_PARAMS.accentColor),
    showOverlayText: asBoolean(source['showOverlayText'], DEFAULT_TEMPLATE_PARAMS.showOverlayText),
    showLogo: asBoolean(source['showLogo'], DEFAULT_TEMPLATE_PARAMS.showLogo),
    // Not the default, which is the one fallback here that is not — and only
    // for a version-1 file.
    //
    // A saved project has to reproduce its own design (ADR-0001), and every
    // Front Panel written before v1.1 was drawn as an inset square. v1.0 and
    // v1.1 files both carry version 1, so the version cannot tell those two
    // apart — but `writeProjectFile` serialises the whole params object, so
    // every v1.1 file states this key one way or the other and only a v1.0 file
    // omits it. Inside version 1, the absence is the tell and it means "square".
    //
    // From version 2 the tell is retired. A version-2 file that omits the key
    // was not written by this app, which always writes it, so reading a v1.0
    // convention into it would be guessing about a document that predates
    // nothing. It gets the default instead, which is the bleed — and this is
    // the first thing the version bump is actually able to decide.
    insetArtwork: asBoolean(
      source['insetArtwork'],
      version <= 1 ? true : DEFAULT_TEMPLATE_PARAMS.insetArtwork,
    ),
  };
}

function readLabel(value: unknown): LabelDimensions {
  const source = isRecord(value) ? value : {};
  const fallback = DEFAULT_PART_DIMENSIONS.label;
  return {
    width: clamp(
      asNumber(source['width'], fallback.width),
      LABEL_SIZE_RANGE.min,
      LABEL_SIZE_RANGE.max,
    ),
    height: clamp(
      asNumber(source['height'], fallback.height),
      LABEL_SIZE_RANGE.min,
      LABEL_SIZE_RANGE.max,
    ),
    notch: asBoolean(source['notch'], fallback.notch),
    notchSize: Math.max(0, asNumber(source['notchSize'], fallback.notchSize)),
  };
}

/**
 * The Insert's five measurements, out of a version-2 `insert` block or a version-1
 * `jcard` one.
 *
 * Four of the five are the J-Card's own numbers under a new name — the Inner
 * Flap, the Spine, the Front Panel and the height are the same lengths measured
 * off the same case (ADR-0012 keeps all three panels) — so a v1 file's `jcard`
 * block is read straight into them rather than being discarded. `pageWidth` has
 * no v1 source, there being no Pages, and takes the default.
 *
 * Not branched on the version: a file states one key or the other, and looking
 * for `insert` first and falling back is the same answer with one less thing that
 * can be wrong. A version-1 file's `backCard` block is not read at all — the Back
 * Card is gone and its 69 mm width has no counterpart on the strip, whose Pages
 * are 65 by the case rather than 69 by the old rectangle.
 */
function readInsert(value: unknown, legacyJCard: unknown): InsertDimensions {
  const source = isRecord(value) ? value : isRecord(legacyJCard) ? legacyJCard : {};
  const defaults = DEFAULT_PART_DIMENSIONS.insert;
  // Bounded at both ends: a Part wider than any paper this app knows is not a
  // Part, and letting it through only moves the failure into the renderer.
  const positive = (raw: unknown, fallback: number): number =>
    clamp(asNumber(raw, fallback), MIN_PART_MM, MAX_PART_MM);

  return {
    innerFlapWidth: positive(source['innerFlapWidth'], defaults.innerFlapWidth),
    spineWidth: positive(source['spineWidth'], defaults.spineWidth),
    frontPanelWidth: positive(source['frontPanelWidth'], defaults.frontPanelWidth),
    // Its own range rather than the shared 1–300: a Page is what makes the strip
    // long, and at four Pages every millimetre here is three on the paper.
    pageWidth: clamp(
      asNumber(source['pageWidth'], defaults.pageWidth),
      PAGE_WIDTH_RANGE.min,
      PAGE_WIDTH_RANGE.max,
    ),
    height: positive(source['height'], defaults.height),
  };
}

function readDimensions(value: unknown): PartDimensions {
  const source = isRecord(value) ? value : {};
  return {
    insert: readInsert(source['insert'], source['jcard']),
    label: readLabel(source['label']),
  };
}

/**
 * A Page count the collector set by hand, or nothing.
 *
 * Even, at least two and at most {@link MAX_INSERT_PAGES}, because those are the
 * only counts ADR-0012 can fold — and a file is not trusted to agree. Anything
 * else is no override at all rather than a clamped one: a file saying `3` did not
 * come from this app, and guessing which of 2 and 4 it meant would be inventing a
 * decision on the collector's behalf. Absent means "work it out from the
 * content", which is the ordinary case and the better default.
 */
function readPageCount(value: unknown): number | undefined {
  const pages = asNumber(value, 0);
  if (!Number.isSafeInteger(pages) || pages % 2 !== 0) return undefined;
  return pages >= 2 && pages <= MAX_INSERT_PAGES ? pages : undefined;
}

/**
 * Which Parts a print job wants, including out of a version-1 file that names
 * Parts this version no longer has.
 *
 * `jcard` and `back-card` both become the Insert, which is the toggle collapse
 * ADR-0012 describes: a v1 Design has exactly one J-Card and one Back Card, and
 * that is exactly a two-Page Insert. Mapping them rather than filtering them out
 * matters for the one case where it shows — a collector who printed J-Cards only
 * would otherwise fall through to "everything" and get Labels they did not ask
 * for.
 */
const LEGACY_PARTS: Readonly<Record<string, PartKind>> = {
  jcard: 'insert',
  'back-card': 'insert',
  insert: 'insert',
  label: 'label',
};

function readParts(value: unknown): readonly PartKind[] {
  if (!Array.isArray(value)) return PART_KINDS;
  const named = new Set(
    value.flatMap((entry) => {
      const part = LEGACY_PARTS[asString(entry)];
      return part ? [part] : [];
    }),
  );
  // Read back through `PART_KINDS` so the order is canonical however the file
  // listed them, and so two legacy names collapsing to one Part cannot duplicate
  // it.
  const parts = PART_KINDS.filter((part) => named.has(part));
  return parts.length > 0 ? parts : PART_KINDS;
}

function readTemplateId(value: unknown): TemplateId {
  const id = asString(value);
  // hasOwn, not `in`: `in` walks the prototype chain, so "constructor" and
  // "toString" would pass and templateFor would hand back Object.
  return Object.hasOwn(TEMPLATES, id) ? (id as TemplateId) : DEFAULT_DESIGN_CHOICE.templateId;
}

/**
 * The project's measurements: the `measurements` block a version-2 file carries, or
 * the Part sizes a version-1 file kept inside each of its Designs.
 *
 * The migration is a collapse, and it can lose something. v1's Label control
 * wrote to the selected Release and to nothing else, so a v1 project really can
 * hold as many Labels as it has Releases — which is the asymmetry version 2
 * exists to remove, and there is no longer a shape to express it in. The first
 * Design that states any dimensions wins, because after an import the first Release is
 * the one selected, and so the one whose Parts the collector is looking at when
 * they judge whether the measurements survived.
 *
 * Not branched on the version, deliberately: a version-2 file with no `measurements`
 * block is not something this app writes, and looking for the old key and
 * finding none — version 2 stops writing it — lands it on the defaults, which
 * is the right answer for a document that states nothing either way.
 */
function readMeasurements(value: unknown, designs: readonly unknown[]): Measurements {
  if (isRecord(value)) return { dimensions: readDimensions(value['dimensions']) };

  const legacy = designs.find((design) => isRecord(design) && design['dimensions'] !== undefined);
  if (!isRecord(legacy)) return DEFAULT_MEASUREMENTS;
  return { dimensions: readDimensions(legacy['dimensions']) };
}

function readSheet(value: unknown): SheetConfig | string {
  const source = isRecord(value) ? value : {};
  const paperId = asString(source['paperId'], A4.id);
  const paper: PaperSize | undefined = PAPER_SIZES.find((candidate) => candidate.id === paperId);
  if (!paper) return `This project was saved for a paper size this version does not know: "${paperId}".`;

  return {
    paper,
    marginMm: clamp(asNumber(source['marginMm'], DEFAULT_PRINTABLE_MARGIN_MM), 0, MAX_MARGIN_MM),
    // A project with nothing to print is a project that cannot be opened, which
    // is why `readParts` falls back to everything rather than to nothing.
    parts: readParts(source['parts']),
  };
}

export function readProjectFile(text: string): ProjectReadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file could not be read as JSON. Is it a project file?' };
  }

  if (!isRecord(parsed) || parsed['format'] !== PROJECT_FORMAT) {
    return { ok: false, error: 'That is not a MinicovereD project file.' };
  }

  const version = asNumber(parsed['version'], 0);
  if (version > PROJECT_VERSION) {
    return {
      ok: false,
      error: `That project was saved by a newer version of MinicovereD (file version ${version}, this one reads ${PROJECT_VERSION}).`,
    };
  }

  const sheet = readSheet(parsed['sheet']);
  if (typeof sheet === 'string') return { ok: false, error: sheet };

  const rawDesigns: readonly unknown[] = Array.isArray(parsed['designs']) ? parsed['designs'] : [];
  const measurements = readMeasurements(parsed['measurements'], rawDesigns);
  const entries: QueueEntry[] = [];
  const seenIds = new Set<string>();

  for (const [index, raw] of rawDesigns.entries()) {
    const source = isRecord(raw) ? raw : {};
    const release = readRelease(source['release'], index);
    if (typeof release === 'string') return { ok: false, error: release };

    // Parts find their Release by id, so two Releases sharing one would print
    // the same content twice. Better to say so than to render it.
    if (seenIds.has(release.id)) {
      return { ok: false, error: `Two Releases in that project share the id "${release.id}".` };
    }
    seenIds.add(release.id);

    const pageCount = readPageCount(source['pageCount']);
    const design: ReleaseDesign = {
      release,
      templateId: readTemplateId(source['templateId']),
      params: readParams(source['params'], version),
      ...(pageCount === undefined ? {} : { pageCount }),
    };
    // A file written before this flag existed has no such key, and every
    // Release in it was one the collector had finished with.
    entries.push(
      asBoolean(source['needsCompleting'], false) ? unfinishedEntry(design) : readyEntry(design),
    );
  }

  return { ok: true, project: { entries, sheet, measurements } };
}
