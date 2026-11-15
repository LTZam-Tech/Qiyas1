import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 4200,
    host: '0.0.0.0',
    allowedHosts: ['qiyas.iltizamtech.com', 'localhost'],
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
