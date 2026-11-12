import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * En desarrollo el frontend y la API comparten origen (`localhost:5173`):
 * Vite reenvía `/api` al servidor Express. Así las cookies HttpOnly
 * funcionan sin CORS y la cabecera Origin coincide con APP_ORIGIN.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Se usa el código fuente del paquete compartido para mantener los
      // mismos esquemas zod en cliente y servidor durante el desarrollo.
      '@cartera/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: false,
      },
      '/health': {
        target: 'http://localhost:3000',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
