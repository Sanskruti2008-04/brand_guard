import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxy = {
  // Forward API calls to the Express server so the browser stays same-origin
  // (works from localhost, 127.0.0.1 and LAN IPs without CORS issues).
  '/api': {
    target: 'http://localhost:5001',
    changeOrigin: true
  }
};

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, proxy },
  preview: { port: 4173, strictPort: true, proxy }
});
