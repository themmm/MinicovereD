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
   * All of them, not only what the Label control reaches. That control reaches
   * three of the ten fields — the Label's width, its height and whether the
   * corner is notched. The other seven have never had a control and still do
   * not: the Label's notch *size*, the J-Card's four and the Back Card's two.
   * They are reachable only by hand-editing a project file, and clamped to
   * 1–300 mm on the way back in.
   *
   * They moved anyway, because they are measurements by every argument the
   * Label is and leaving them inside the Designs would have kept the split
   * half-made. They got no controls because ADR-0012 replaces both those Parts
   * with the Insert in ticket 08, and six controls for numbers about to be
   * restructured is waste.
   */
  readonly dimensions: PartDimensions;
}

export const DEFAULT_MEASUREMENTS: Measurements = { dimensions: DEFAULT_PART_DIMENSIONS };
