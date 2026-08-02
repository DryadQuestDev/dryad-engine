import { defineConfig, Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import checker from 'vite-plugin-checker'
import path from 'path'
import fs from 'fs'

// Read package.json to get the version
const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'))
const appVersion = packageJson.version

const fullReloadAlways: Plugin = {
  name: 'full-reload-always',
  handleHotUpdate({ server }) {
    server.ws.send({ type: 'full-reload' });
    return [];
  },
};

// The dev server serves the WIP games via local-only symlinks under public/assets/games_*/ that
// point INTO production/ (the electron-builder output). Vite's built-in copyPublicDir follows those
// symlinks and aborts the build (ENOENT) whenever a target is momentarily absent mid-rebuild, and
// otherwise copies the output back through dist circularly. This build-only plugin does the
// public->dist copy itself, skipping broken symlinks and any symlink resolving into production/.
const PRODUCTION_DIR = path.resolve(__dirname, 'production');

let publicOutDir = path.resolve(__dirname, 'dist');

const copyPublicSkipDevGames: Plugin = {
  name: 'copy-public-skip-dev-games',
  apply: 'build',
  configResolved(config) {
    // Must track --outDir: build-web.sh/build-capacitor.sh build into dist-web/, and a
    // hardcoded dist/ silently leaves those builds without assets/engine_files.
    publicOutDir = path.resolve(config.root, config.build.outDir);
  },
  closeBundle: async () => {
    await fs.promises.cp(
      path.resolve(__dirname, 'public'),
      publicOutDir,
      {
        recursive: true,
        dereference: true, // copy real file contents, matching Vite's follow behavior
        filter: (src) => {
          try {
            if (fs.lstatSync(src).isSymbolicLink()) {
              const real = fs.realpathSync(src); // throws on a broken link
              if (real.startsWith(PRODUCTION_DIR)) return false; // dev WIP game symlink -> skip
            }
          } catch {
            return false; // broken symlink -> skip (that game isn't available anyway)
          }
          return true;
        },
      },
    );
  },
};

// https://vite.dev/config/
export default defineConfig(() => {
  const isNoWatchMode = process.env.NO_WATCH === 'true';

  return {
    base: './',
    plugins: [
      vue(),
      checker({
        vueTsc: {
          tsconfigPath: 'tsconfig.app.json'
        }
      }),
      fullReloadAlways,
      copyPublicSkipDevGames,
    ],
    resolve: {
      alias: {
        'vue': 'vue/dist/vue.esm-bundler.js',
        '@': path.resolve(__dirname, './src'),
      }
    },
    build: {
      assetsDir: 'base',
      copyPublicDir: false // handled by copyPublicSkipDevGames (skips into-production/ dev symlinks)
    },
    // Define environment variables
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
      'import.meta.env.VITE_WEB_MODE': JSON.stringify(process.env.VITE_WEB_MODE || '')
    },
    css: {
      devSourcemap: true
    },
    server: {
      port: 4200,
      watch: isNoWatchMode ? null : undefined, // Disable watch if NO_WATCH is true
      hmr: isNoWatchMode ? false : undefined, // Disable HMR if NO_WATCH is true
    }
  };
})
