/**
 * Stub for `virtual:pwa-register` in the single-file build. That artifact is a
 * lone .html file opened from disk: there is no service worker to register,
 * because everything the app needs is already inlined — which makes it offline
 * ready the moment it loads.
 */
export function registerSW(options: { onOfflineReady?: () => void } = {}): () => Promise<void> {
  options.onOfflineReady?.();
  return async () => {};
}
