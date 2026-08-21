import { registerSW } from 'virtual:pwa-register';

export type OfflineState = 'unsupported' | 'preparing' | 'ready';

/**
 * Registers the service worker that makes the hosted app installable and
 * offline-capable (ADR-0002), and reports when the offline copy is complete.
 *
 * The single-file build aliases `virtual:pwa-register` to a stub: that artifact
 * is already one self-contained file, so it has nothing to cache.
 */
export function watchOfflineReadiness(onChange: (state: OfflineState) => void): void {
  if (!('serviceWorker' in navigator)) {
    onChange('unsupported');
    return;
  }
  onChange('preparing');
  registerSW({
    immediate: true,
    onOfflineReady: () => onChange('ready'),
    onRegisteredSW: (_url, registration) => {
      if (registration?.active) onChange('ready');
    },
  });
}
