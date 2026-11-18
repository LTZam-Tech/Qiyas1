import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'

// https://vite.dev/config/
// The dev server is for a developer's own machine. It listens on localhost only; to reach it from
// another device on your LAN, opt in with QIYAS_VITE_HOST=0.0.0.0 (or a specific address).
// Never put it behind a public host name: serve users through the Docker stack in deploy/.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 4200,
    host: process.env.QIYAS_VITE_HOST || 'localhost',
    allowedHosts: ['localhost'],
    fs: {
      // Never serve secrets or the backend from the dev server (replaces Vite's default list, which is kept here).
      deny: [
        '.env', '.env.*', '*.{crt,pem,key,p12,pfx}', '**/.git/**',
        '**/backend/**', '**/deploy/.env', '**/deploy/certs/**',
        'Credentials.md', 'DEBUG-LOGIN.md',
      ],
    },
    // The backend (its build output and local database files) is not part of the web app.
    watch: { ignored: ['**/backend/**', '**/mock-api/**'] },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8082',
        changeOrigin: true,
      }
    }
  },
})
