/// <reference types='vitest' />
import path from 'path';

import dotenv from 'dotenv';
import tsconfigPaths from 'vite-tsconfig-paths';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import checker from 'vite-plugin-checker';
import tailwindcss from '@tailwindcss/vite';
import customHtmlPlugin from './vite-plugins/html-plugin';

dotenv.config({ path: path.resolve(__dirname, '../../.env.dev') });

export default defineConfig(({ command, mode }) => {
  const isDev = command === 'serve' || mode === 'development';

  const AP_TITLE = 'JRNYFLW';
  const AP_FAVICON = '/assets/brand/jrnyflw-mark.svg';

  const apiPort = process.env.AP_PORT ?? '3000';
  const apiTarget = `http://127.0.0.1:${apiPort}`;

  return {
    root: __dirname,
    cacheDir: '../../node_modules/.vite/packages/web',
    server: {
      allowedHosts: ['dev.sideswipe.home'],
      proxy: {
        '/api': {
          target: apiTarget,
          secure: false,
          changeOrigin: true,
          headers: {
            Host: '127.0.0.1:4200',
          },
          ws: true,
        },
        '^/mcp$': {
          target: apiTarget,
          secure: false,
          changeOrigin: true,
          rewrite: (p: string) => p,
        },
        '/.well-known': {
          target: apiTarget,
          secure: false,
          changeOrigin: true,
        },
        '/register': {
          target: apiTarget,
          secure: false,
          changeOrigin: true,
        },
        '/authorize': {
          target: apiTarget,
          secure: false,
          changeOrigin: true,
        },
        '/token': {
          target: apiTarget,
          secure: false,
          changeOrigin: true,
        },
        '/revoke': {
          target: apiTarget,
          secure: false,
          changeOrigin: true,
        },
      },
      port: 4200,
      host: '0.0.0.0',
    },

    preview: {
      port: 4300,
      host: 'localhost',
    },
    resolve: {
      dedupe: [
        '@codemirror/state',
        '@codemirror/view',
        '@codemirror/language',
        '@codemirror/commands',
      ],
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@activepieces/shared': path.resolve(
          __dirname,
          '../../packages/shared/src',
        ),
        'ee-embed-sdk': path.resolve(
          __dirname,
          '../../packages/ee/embed-sdk/src',
        ),
        '@activepieces/pieces-framework': path.resolve(
          __dirname,
          '../../packages/pieces/framework/src',
        ),
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      tsconfigPaths(),
      customHtmlPlugin({
        title: AP_TITLE,
        icon: AP_FAVICON,
      }),
      ...(isDev
        ? [
            checker({
              typescript: {
                buildMode: true,
                tsconfigPath: './tsconfig.json',
                root: __dirname,
              },
            }),
          ]
        : []),
    ],

    build: {
      outDir: '../../dist/packages/web',
      emptyOutDir: true,
      reportCompressedSize: true,
      commonjsOptions: {
        transformMixedEsModules: true,
      },
      rollupOptions: {
        onLog(level, log, handler) {
          if (
            log.cause &&
            log.message.includes(`Can't resolve original location of error.`)
          ) {
            return;
          }
          handler(level, log);
        },
      },
    },
  };
});
