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
    ],
    resolve: {
      alias: {
        'vue': 'vue/dist/vue.esm-bundler.js',
        '@': path.resolve(__dirname, './src'),
      }
    },
    build: {
      assetsDir: 'base'
    },
    // Define environment variables
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion)
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
