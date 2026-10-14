import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    define: { 'import.meta.env.VITE_PORTAL': JSON.stringify('staff') },
    server: {
      port: 5174,
      proxy: {
        '/api': {
          target: env.API_PROXY_TARGET || 'http://localhost:5216',
          changeOrigin: true,
          // Only the local development certificate may be untrusted.
          secure: !['localhost', '127.0.0.1'].includes(new URL(env.API_PROXY_TARGET || 'http://localhost:5216').hostname),
        },
      },
    },
  }
})
