import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { version } from './package.json'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [{
    name: 'release-metadata',
    transformIndexHtml() {
      return [{ tag: 'meta', attrs: { name: 'application-version', content: version }, injectTo: 'head' as const }]
    },
  }],
  publicDir: false,
  envDir: false,
  envPrefix: [],
  define: { __OPERATOR_MODE__: JSON.stringify(mode === 'operator') },
  server: {
    host: '127.0.0.1',
    fs: {
      allow: [root],
      deny: [
        '**/.env*',
        '**/*.{crt,pem,key,sqlite,sqlite3,db}',
        '**/*.{sqlite,sqlite3,db}-*',
        '**/.git/**',
        '**/.private/**',
        '**/.nokitchen*/**',
        '**/dist-operator/**',
        '**/server/**',
        '**/private/**',
        '**/private-data/**',
        '**/operator-link.txt*',
        '**/.operator-link-*',
      ],
    },
  },
  build: {
    outDir: mode === 'operator' ? 'dist-operator' : 'dist',
    assetsInlineLimit: 100_000,
    modulePreload: false,
    sourcemap: false,
  },
}))
