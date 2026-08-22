import { describe, expect, it } from 'vitest';

import { admitRestore, refuseImport } from './project-arrival.ts';

describe('a project arriving while a Batch runs', () => {
  it('refuses an import, and names the Batch as the reason', () => {
    const refusal = refuseImport({ edited: false, batchRunning: true });

    expect(refusal).toMatch(/batch/i);
    // The house sentence for a failed import: the collector has to know their
    // queue is still theirs.
    expect(refusal).toMatch(/nothing was changed/i);
  });

  it('discards a late restore, the same way an edit discards one', () => {
    expect(admitRestore({ edited: false, batchRunning: true })).toBe(false);
  });
});

describe('a project arriving on a quiet session', () => {
  it('lets an import through', () => {
    expect(refuseImport({ edited: false, batchRunning: false })).toBeUndefined();
  });

  it('lets a restore through', () => {
    expect(admitRestore({ edited: false, batchRunning: false })).toBe(true);
  });
});

describe('an edit', () => {
  it('beats a late restore', () => {
    // The v1 rule, written down: the saved copy is the collector's own older
    // work, and they are looking at the newer.
    expect(admitRestore({ edited: true, batchRunning: false })).toBe(false);
  });

  it('does not stand in the way of an import', () => {
    // The opposite case, and deliberately so: the collector chose the file with
    // their own work on screen. Refusing that would make the button a liar.
    expect(refuseImport({ edited: true, batchRunning: false })).toBeUndefined();
  });
});
