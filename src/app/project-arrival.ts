/**
 * When a Project arriving from somewhere else may replace the work on screen.
 *
 * Two of them arrive: a project file the collector opened, and this browser's
 * saved copy answering after the page has already started being used. Both
 * replace the whole Queue, so both need an answer to the same question — is
 * anything in this session newer than what is arriving?
 *
 * The rule lives here rather than inline in the workspace because it is a
 * statement about the session and not about the DOM — and because what beats
 * what is worth being able to assert directly, instead of inferring it from a
 * browser doing two things at once.
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
 * Only a running Batch refuses one, and not because the two would collide in
 * mid-air. A Batch collects its Entries as it goes and hands them over in one
 * piece when the last lookup returns, adding them to whatever Queue it finds
 * at that moment. So a project opened while the lookups are still running is
 * neither overwritten by the Batch nor overwrites it: the two are silently
 * merged, and the collector is left with one Queue holding two sessions and
 * nothing to say which Releases came from where.
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
 * the same reason, and by the same mechanism as an import: the Batch appends
 * its Entries to whatever Queue exists when it finishes, so a restore applied
 * while it runs is a restore the Batch then merges itself into.
 *
 * Refused silently, on purpose. The Batch is about to report what it added, and
 * a second sentence about a saved copy nobody asked for would bury it.
 */
export function admitRestore(work: SessionWork): boolean {
  return !work.edited && !work.batchRunning;
}
