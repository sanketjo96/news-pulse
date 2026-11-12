import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './', // relative paths so it works under /<repo>/ on GitHub Pages
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3001' } },
});
