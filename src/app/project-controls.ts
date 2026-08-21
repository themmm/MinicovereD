import { errorMessage } from '../errors.ts';
import { readProjectFile, writeProjectFile } from '../persist/project-file.ts';
import type { Project } from '../persist/project-file.ts';
import { el } from './dom.ts';

/**
 * Project files: one JSON document with the artwork inside it, so a design
 * moves between devices and survives as a backup (ADR-0001). Importing is the
 * one place a file the app did not write gets read, so nothing is applied until
 * the whole file has been understood.
 */

/** Long enough for a browser to start the download before the URL is revoked. */
const DOWNLOAD_URL_LIFETIME_MS = 30_000;

export interface ProjectControls {
  readonly element: HTMLElement;
  /** Say what happened, in the same place the user pressed the button. */
  report(message: string): void;
}

export function createProjectControls(
  currentProject: () => Project,
  onImported: (project: Project) => void,
): ProjectControls {
  const status = el('p', { class: 'field__note', attrs: { role: 'status' }, text: '' });

  const exportButton = el('button', {
    class: 'button',
    text: 'Export project…',
    attrs: { type: 'button' },
    on: {
      click: () => {
        const { designs, sheet } = currentProject();
        download(writeProjectFile(designs, sheet), fileNameFor(designs.length));
        status.textContent = `Saved ${designs.length} ${
          designs.length === 1 ? 'Release' : 'Releases'
        } to a project file, artwork included.`;
      },
    },
  });

  const input = el('input', {
    class: 'field__file',
    attrs: { type: 'file', accept: 'application/json,.json', id: 'project-import' },
    on: {
      change: (event) => {
        const element = event.target as HTMLInputElement;
        const file = element.files?.[0];
        // Clear it now, so choosing the same file twice still fires.
        element.value = '';
        if (!file) return;

        void file
          .text()
          .then((text) => {
            const result = readProjectFile(text);
            if (!result.ok) {
              // Nothing has been touched: the autosaved project is still there.
              status.textContent = `${result.error} Nothing was changed.`;
              return;
            }
            // The caller reports what it actually applied.
            onImported(result.project);
          })
          .catch((error: unknown) => {
            status.textContent = `That file could not be read: ${errorMessage(error)}. Nothing was changed.`;
          });
      },
    },
  });

  const element = el(
    'section',
    { class: 'panel' },
    el('h2', { class: 'panel__title', text: 'Project' }),
    el('p', {
      class: 'panel__hint',
      text: 'Your work saves itself in this browser. Export it to move it to another device or keep a backup.',
    }),
    el(
      'div',
      { class: 'field-buttons' },
      exportButton,
      el('label', { class: 'button', attrs: { for: 'project-import' } }, 'Open project…', input),
    ),
    status,
  );

  return {
    element,
    report(message) {
      status.textContent = message;
    },
  };
}

function fileNameFor(releaseCount: number): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `mdcovergen-${releaseCount}-releases-${stamp}.json`;
}

function download(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = el('a', { class: 'visually-hidden', attrs: { href: url, download: fileName } });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS);
}
