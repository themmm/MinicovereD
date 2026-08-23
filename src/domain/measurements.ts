import { DEFAULT_PART_DIMENSIONS } from './parts.ts';
import type { PartDimensions } from './parts.ts';

/**
 * The measurements a collector sets once: how big their cartridges are, and so
 * how big the paper has to be cut. True of every Release, and therefore part of
 * no Design.
 *
 * These are what the spec calls the app settings, and they are named for what
 * they turned out to be instead: every one of them is a length in millimetres,
 * and the fold the collector sets them in says Measurements on it. One thing,
 * one name (CONTEXT.md).
 *
 * The line being drawn is fit against taste. A Design says what one record
 * should look like — Template, colours, what appears on the artwork — and two
 * Releases in a Queue are allowed to disagree about every bit of it. These say
 * what shape the Parts are cut to, and two Releases disagreeing about that
 * means one of them does not fit the cartridge in the collector's hand.
 *
 * v1 put both in `ReleaseDesign`, which is why nudging the Label applied to the
 * Release on screen and to nothing else — and why a Batch entry and a Release
 * started by hand each landed on their own hard-coded defaults instead. There
 * was no rule that fit, because the object held two kinds of choice with
 * opposite correct answers.
 *
 * Paper and printable margin are measurements by the same argument and are not
 * in here: `SheetConfig` has held one copy of them for the whole Queue since
 * v1, so they were never on the wrong side of the line. They also sit beside
 * `SheetConfig.parts`, which is a choice about this print run rather than about
 * the hardware.
 */
export interface Measurements {
  /**
   * Every Part's size in millimetres, shared by every Release in the Queue.
   *
   * All of them, not only what the controls reach. Four of the nine fields have
   * one: the Label's width, its height, whether the corner is notched, and the
   * Insert's Page width. The other five have never had one and still do not — the
   * Label's notch *size* and the Insert's Inner Flap, Spine, Front Panel and
   * height. They are reachable only by hand-editing a project file, and clamped
   * on the way back in.
   *
   * The five without controls are the ones a *case* decides rather than a
   * collector: how tall a front cover is, and how wide its window and its edge
   * are. The Page width is the one Insert measurement the case does not decide —
   * ADR-0012 picked 65 mm because 65 is what fits four Pages on A4 — which is why
   * it is the one that got a control in ticket 08.
   */
  readonly dimensions: PartDimensions;
}

export const DEFAULT_MEASUREMENTS: Measurements = { dimensions: DEFAULT_PART_DIMENSIONS };
