import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@jrnyflw/piece-trace': fileURLToPath(new URL('../trace/src/index.ts', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
  },
})
