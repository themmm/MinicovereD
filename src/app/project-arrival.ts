/**
 * When a Project arriving from somewhere else may replace the work on screen.
 *
 * Two of them arrive: a project file the collector opened, and this browser's
 * saved copy answering after the page has already started being used. Both
 * replace the whole Queue, so both need an answer to the same question — is
 * anything in this session newer than what is arriving?
 *
 * The rule lives here rather than inline in the workspace because it is a
 * statement about the session and not about the DOM, and because getting it
 * wrong is invisible: the losing case is a race, and a race that is only
 * reasoned about is a race that is wrong.
 */

/** What this session has already done that an arriving Project would undo. */
export interface SessionWork {
  /** The collector has changed something since the page loaded. */
  readonly edited: boolean;
  /** A Batch is appending Entries to the Queue right now. */
  readonly batchRunning: boolean;
}

/**
 * Why an import must be refused, or nothing if it may go ahead.
 *
 * Only a running Batch refuses one. A Batch adds Entries to the Queue for as
 * long as a minute, and a Project landing in the middle of one either gets
 * overwritten by the rest of the Batch or throws the Batch's work away —
 * which of the two depends on how far the lookups have got, and an outcome
 * that depends on timing is the worst kind of answer to give a collector.
 *
 * An edit deliberately does *not* refuse an import. The collector chose the
 * file with their own work in front of them; refusing that would make the
 * button a liar.
 */
export function refuseImport(work: SessionWork): string | undefined {
  if (!work.batchRunning) return undefined;
  return (
    'A Batch is still looking up Releases, and opening a project would replace the Queue it is ' +
    'filling. Wait for the Batch to finish, then open the file again. Nothing was changed.'
  );
}

/**
 * Whether this browser's saved copy, arriving late, may still be applied.
 *
 * An edit beats it — the v1 rule: the saved copy is the collector's own older
 * work and they are already looking at the newer. A running Batch beats it for
 * the same reason and more sharply, because a Batch that finished after a
 * restore was applied would append its Entries to the restored Queue, and the
 * collector would be left with two sessions merged into one and no way to tell
 * which Releases came from where.
 *
 * Refused silently, on purpose. The Batch is about to report what it added, and
 * a second sentence about a saved copy nobody asked for would bury it.
 */
export function admitRestore(work: SessionWork): boolean {
  return !work.edited && !work.batchRunning;
}
