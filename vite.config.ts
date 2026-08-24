import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Two shapes of the same app (ADR-0002):
 *
 *  - default mode   -> hosted, installable, offline-capable PWA (`dist/pwa`)
 *  - `singlefile`   -> one self-contained .html that boots by double-click (`dist/singlefile`)
 *
 * Both bundle the same OFL fonts, so neither needs the network.
 *
 * Hosting under a sub-path (GitHub Pages project sites, for instance) is a
 * matter of `MINICOVERED_BASE=/minicovered/ npm run build:pwa` — the manifest's
 * scope and start_url follow it, otherwise the installed app would leave its
 * own scope on the first navigation.
 */

const resolveFromRoot = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig(({ mode }) => {
  const singleFile = mode === 'singlefile';
  const base = singleFile ? './' : (process.env['MINICOVERED_BASE'] ?? '/');

  const outDir = singleFile ? 'dist/singlefile' : 'dist/pwa';

  return {
    base,
    // The single-file artifact must be exactly one file: nothing gets copied beside it.
    publicDir: singleFile ? false : 'public',
    resolve: {
      alias: singleFile
        ? {
            // vite-plugin-pwa is not in play here, so its virtual module needs a stand-in.
            'virtual:pwa-register': resolveFromRoot('./src/pwa/no-service-worker.ts'),
          }
        : {},
    },
    define: {
      __SELF_CONTAINED_BUILD__: JSON.stringify(singleFile),
    },
    build: {
      outDir,
      emptyOutDir: true,
      target: 'es2022',
      // The single-file build has to swallow ~1.5 MB of font subsets as data URIs.
      assetsInlineLimit: singleFile ? Number.MAX_SAFE_INTEGER : 4096,
      chunkSizeWarningLimit: 12_000,
    },
    plugins: singleFile
      ? [viteSingleFile({ removeViteModuleLoader: true }), dropOperatingSystemJunk(outDir)]
      : [
          dropOperatingSystemJunk(outDir),
          VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['icons/*.png'],
            manifest: {
              name: 'MinicovereD — MiniDisc cover generator',
              short_name: 'MinicovereD',
              description:
                'Design and print MiniDisc case Inserts and cartridge Labels as print-accurate PDFs.',
              lang: 'en',
              start_url: base,
              scope: base,
              display: 'standalone',
              // Everforest Light (ADR-0008): the splash is the page, the
              // browser chrome is the ink band the header is painted in.
              background_color: '#efebd4',
              theme_color: '#5c6a72',
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

/**
 * Keeps the build free of files the operating system left lying around.
 *
 * macOS writes `.DS_Store` into any folder Finder has opened — `public/`
 * included — and Vite copies `public/` wholesale, so a release built on a Mac
 * ships one developer's window positions. It is gitignored, so a clean
 * checkout never has one; this is for every build that is not a clean
 * checkout, which is most of them.
 */
function dropOperatingSystemJunk(outDir: string): Plugin {
  return {
    name: 'minicovered:drop-os-junk',
    apply: 'build',
    // After the write, because public/ is copied outside the bundle and so is
    // invisible to generateBundle.
    closeBundle() {
      const sweep = (directory: string): void => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
          const path = join(directory, entry.name);
          if (entry.isDirectory()) sweep(path);
          else if (entry.name.startsWith('.')) rmSync(path);
        }
      };
      sweep(resolveFromRoot(outDir));
    },
  };
}
