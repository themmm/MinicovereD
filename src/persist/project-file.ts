import { A4, DEFAULT_PRINTABLE_MARGIN_MM, PAPER_SIZES } from '../domain/paper.ts';
import type { PaperSize } from '../domain/paper.ts';
import {
  DEFAULT_PART_DIMENSIONS,
  LABEL_SIZE_RANGE,
  PART_KINDS,
} from '../domain/parts.ts';
import type { LabelDimensions, PartDimensions } from '../domain/parts.ts';
import type { Artwork, Release, Track } from '../domain/release.ts';
import { readyEntry, unfinishedEntry } from '../queue/release-queue.ts';
import type { QueueEntry } from '../queue/release-queue.ts';
import { safeLogoColor } from '../render/minidisc-logo.ts';
import { DEFAULT_TEMPLATE_PARAMS, TEMPLATES } from '../render/sheet-renderer.ts';
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
export const PROJECT_VERSION = 1;

export interface Project {
  /** The queue as it stood, in order, entries still needing a hand included. */
  readonly entries: readonly QueueEntry[];
  readonly sheet: SheetConfig;
}

export type ProjectReadResult =
  | { readonly ok: true; readonly project: Project }
  | { readonly ok: false; readonly error: string };

/** Below this a Sheet has no printable area worth the name. */
const MAX_MARGIN_MM = 40;

/** No Part is smaller than a fold or larger than the biggest paper this app prints. */
const MIN_PART_MM = 1;
const MAX_PART_MM = 300;

export function writeProjectFile(
  entries: readonly QueueEntry[],
  sheet: SheetConfig,
): string {
  return `${JSON.stringify(
    {
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      savedAt: new Date().toISOString(),
      designs: entries.map(({ design, status }) => ({
        release: design.release,
        templateId: design.templateId,
        params: design.params,
        dimensions: design.dimensions,
        // Written only when true, so a project of ordinary Releases reads the
        // same as one written before this flag existed. The reason the lookup
        // failed is deliberately not written; see QueueEntry.error.
        ...(status === 'failed' ? { needsCompleting: true } : {}),
      })),
      sheet: { paperId: sheet.paper.id, marginMm: sheet.marginMm, parts: sheet.parts },
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
  return {
    id,
    artist: asString(value['artist']),
    album: asString(value['album']),
    ...(year ? { year } : {}),
    ...(notes ? { notes } : {}),
    tracks: readTracks(value['tracks']),
    ...(artwork ? { artwork } : {}),
  };
}

function readParams(value: unknown): TemplateParams {
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
    // Not the default, which is the one fallback here that is not.
    //
    // A saved project has to reproduce its own design (ADR-0001), and every
    // Front Panel written before v1.1 was drawn as an inset square. v1 and v1.1
    // files both carry `PROJECT_VERSION` 1, so the version cannot tell them
    // apart — but `writeProjectFile` serialises the whole params object, so
    // every v1.1 file states this key one way or the other and only a v1 file
    // omits it. The absence is the tell, and it means "square". A new design
    // still bleeds, because that comes from `DEFAULT_TEMPLATE_PARAMS` rather
    // than from here.
    insetArtwork: asBoolean(source['insetArtwork'], true),
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

function readDimensions(value: unknown): PartDimensions {
  const source = isRecord(value) ? value : {};
  const jcard = isRecord(source['jcard']) ? source['jcard'] : {};
  const backCard = isRecord(source['backCard']) ? source['backCard'] : {};
  const defaults = DEFAULT_PART_DIMENSIONS;
  // Bounded at both ends: a Part wider than any paper this app knows is not a
  // Part, and letting it through only moves the failure into the renderer.
  const positive = (raw: unknown, fallback: number): number =>
    clamp(asNumber(raw, fallback), MIN_PART_MM, MAX_PART_MM);

  return {
    jcard: {
      innerFlapWidth: positive(jcard['innerFlapWidth'], defaults.jcard.innerFlapWidth),
      spineWidth: positive(jcard['spineWidth'], defaults.jcard.spineWidth),
      frontPanelWidth: positive(jcard['frontPanelWidth'], defaults.jcard.frontPanelWidth),
      height: positive(jcard['height'], defaults.jcard.height),
    },
    backCard: {
      width: positive(backCard['width'], defaults.backCard.width),
      height: positive(backCard['height'], defaults.backCard.height),
    },
    label: readLabel(source['label']),
  };
}

function readTemplateId(value: unknown): TemplateId {
  const id = asString(value);
  // hasOwn, not `in`: `in` walks the prototype chain, so "constructor" and
  // "toString" would pass and templateFor would hand back Object.
  return Object.hasOwn(TEMPLATES, id) ? (id as TemplateId) : 'classic';
}

function readSheet(value: unknown): SheetConfig | string {
  const source = isRecord(value) ? value : {};
  const paperId = asString(source['paperId'], A4.id);
  const paper: PaperSize | undefined = PAPER_SIZES.find((candidate) => candidate.id === paperId);
  if (!paper) return `This project was saved for a paper size this version does not know: "${paperId}".`;

  const parts = Array.isArray(source['parts'])
    ? PART_KINDS.filter((part) => (source['parts'] as unknown[]).includes(part))
    : PART_KINDS;

  return {
    paper,
    marginMm: clamp(asNumber(source['marginMm'], DEFAULT_PRINTABLE_MARGIN_MM), 0, MAX_MARGIN_MM),
    // A project with nothing to print is a project that cannot be opened.
    parts: parts.length > 0 ? parts : PART_KINDS,
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

  const rawDesigns = Array.isArray(parsed['designs']) ? parsed['designs'] : [];
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

    const design: ReleaseDesign = {
      release,
      templateId: readTemplateId(source['templateId']),
      params: readParams(source['params']),
      dimensions: readDimensions(source['dimensions']),
    };
    // A file written before this flag existed has no such key, and every
    // Release in it was one the collector had finished with.
    entries.push(
      asBoolean(source['needsCompleting'], false) ? unfinishedEntry(design) : readyEntry(design),
    );
  }

  return { ok: true, project: { entries, sheet } };
}
