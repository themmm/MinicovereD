import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Two shapes of the same app (ADR-0002):
 *
 *  - default mode   -> hosted, installable, offline-capable PWA (`dist/pwa`)
 *  - `singlefile`   -> one self-contained .html that boots by double-click (`dist/singlefile`)
 *
 * Both bundle the same OFL fonts, so neither needs the network to render.
 */
export default defineConfig(({ mode }) => {
  const singleFile = mode === 'singlefile';

  return {
    base: singleFile ? './' : '/',
    // The single-file artifact must be exactly one file: nothing gets copied beside it.
    publicDir: singleFile ? false : 'public',
    resolve: {
      alias: singleFile
        ? {
            // Nothing to register when the whole app is one inlined .html file.
            'virtual:pwa-register': fileURLToPath(
              new URL('./src/pwa/no-service-worker.ts', import.meta.url),
            ),
          }
        : {},
    },
    build: {
      outDir: singleFile ? 'dist/singlefile' : 'dist/pwa',
      emptyOutDir: true,
      target: 'es2022',
      // The single-file build has to swallow ~4 MB of CJK font subsets as data URIs.
      assetsInlineLimit: singleFile ? Number.MAX_SAFE_INTEGER : 4096,
      chunkSizeWarningLimit: 12_000,
    },
    plugins: singleFile
      ? [viteSingleFile({ removeViteModuleLoader: true })]
      : [
          VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['icons/*.png'],
            manifest: {
              name: 'mdcovergen — MiniDisc cover generator',
              short_name: 'mdcovergen',
              description:
                'Design and print MiniDisc J-Cards, Back Cards and cartridge Labels as print-accurate PDFs.',
              lang: 'en',
              start_url: '/',
              scope: '/',
              display: 'standalone',
              background_color: '#15202b',
              theme_color: '#15202b',
              icons: [
                { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
                {
                  src: 'icons/icon-maskable-512.png',
                  sizes: '512x512',
                  type: 'image/png',
                  purpose: 'maskable',
                },
              ],
            },
            workbox: {
              // Fonts are part of the offline promise, so they are precached, not runtime-cached.
              globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
              maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
              cleanupOutdatedCaches: true,
            },
          }),
        ],
  };
});
