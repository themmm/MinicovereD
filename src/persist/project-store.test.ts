import { describe, expect, it, vi } from 'vitest';

import { A4 } from '../domain/paper.ts';
import { DEFAULT_PART_DIMENSIONS, PART_KINDS } from '../domain/parts.ts';
import { DEFAULT_TEMPLATE_PARAMS } from '../render/sheet-renderer.ts';
import type { Project } from './project-file.ts';
import { debounceSave } from './project-store.ts';
import type { ProjectStore } from './project-store.ts';

const projectFor = (album: string): Project => ({
  designs: [
    {
      release: { id: 'r1', artist: 'Glen Campbell', album, tracks: [] },
      templateId: 'classic',
      params: DEFAULT_TEMPLATE_PARAMS,
      dimensions: DEFAULT_PART_DIMENSIONS,
    },
  ],
  sheet: { paper: A4, marginMm: 5, parts: PART_KINDS },
});

function recordingStore(behaviour: { failWith?: Error } = {}): ProjectStore & {
  readonly saved: Project[];
} {
  const saved: Project[] = [];
  return {
    saved,
    load: async () => undefined,
    save: async (project) => {
      if (behaviour.failWith) throw behaviour.failWith;
      saved.push(project);
    },
    clear: async () => {},
  };
}

describe('autosaving after a lull', () => {
  it('writes once for a burst of typing, with the last thing typed', async () => {
    vi.useFakeTimers();
    const store = recordingStore();
    const save = debounceSave(store, 600, () => {});

    save(projectFor('W'));
    save(projectFor('Wi'));
    save(projectFor('Wichita'));
    expect(store.saved, 'nothing written mid-burst').toEqual([]);

    await vi.advanceTimersByTimeAsync(600);
    expect(store.saved).toHaveLength(1);
    expect(store.saved[0]?.designs[0]?.release.album).toBe('Wichita');
    vi.useRealTimers();
  });

  it('writes the waiting project immediately when flushed', async () => {
    vi.useFakeTimers();
    const store = recordingStore();
    const save = debounceSave(store, 600, () => {});

    save(projectFor('Wichita Lineman'));
    // What `pagehide` does: a reload must not cost the last thing typed.
    save.flush();

    await vi.advanceTimersByTimeAsync(0);
    expect(store.saved[0]?.designs[0]?.release.album).toBe('Wichita Lineman');
    vi.useRealTimers();
  });

  it('does not write the same project twice when flushed after the timer fired', async () => {
    vi.useFakeTimers();
    const store = recordingStore();
    const save = debounceSave(store, 600, () => {});

    save(projectFor('Once'));
    await vi.advanceTimersByTimeAsync(600);
    save.flush();
    await vi.advanceTimersByTimeAsync(600);

    expect(store.saved).toHaveLength(1);
    vi.useRealTimers();
  });

  it('reports a failed write instead of swallowing it', async () => {
    vi.useFakeTimers();
    const failure = new Error('quota exceeded');
    const errors: unknown[] = [];
    const save = debounceSave(recordingStore({ failWith: failure }), 600, (error) =>
      errors.push(error),
    );

    save(projectFor('Wichita'));
    await vi.advanceTimersByTimeAsync(600);

    expect(errors).toEqual([failure]);
    vi.useRealTimers();
  });

  it('keeps saving after a failure rather than wedging', async () => {
    vi.useFakeTimers();
    let attempt = 0;
    const saved: Project[] = [];
    const store: ProjectStore = {
      load: async () => undefined,
      save: async (project) => {
        attempt += 1;
        if (attempt === 1) throw new Error('first write failed');
        saved.push(project);
      },
      clear: async () => {},
    };
    const save = debounceSave(store, 600, () => {});

    save(projectFor('First'));
    await vi.advanceTimersByTimeAsync(600);
    save(projectFor('Second'));
    await vi.advanceTimersByTimeAsync(600);

    expect(saved.map((project) => project.designs[0]?.release.album)).toEqual(['Second']);
    vi.useRealTimers();
  });
});
