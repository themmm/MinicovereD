import { registerSW } from 'virtual:pwa-register';

/** How much of the app is available with the network switched off. */
export type OfflineState = 'unsupported' | 'preparing' | 'ready';

/**
 * Reports when the app is usable offline (ADR-0002).
 *
 * The single-file artifact is one .html opened from disk with everything
 * inlined, so it is offline the moment it loads — no service worker involved,
 * and nothing about the browser to check. The hosted PWA gets there by
 * registering the service worker that precaches the build.
 */
export function watchOfflineReadiness(onChange: (state: OfflineState) => void): void {
  if (__SELF_CONTAINED_BUILD__) {
    onChange('ready');
    return;
  }
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
