/**
 * Stub for `virtual:pwa-register` in the single-file build, where the plugin
 * that provides that module is not in play. Nothing calls it: the one branch
 * that would is compiled out by `__SELF_CONTAINED_BUILD__`.
 */
export function registerSW(): () => Promise<void> {
  return async () => {};
}
