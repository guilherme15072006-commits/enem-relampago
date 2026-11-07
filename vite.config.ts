import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'ENEM Relâmpago', short_name: 'ENEM', lang: 'pt-BR', display: 'standalone',
        background_color: '#14121C', theme_color: '#14121C', start_url: '.', icons: [],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,webp}'], globIgnores: ['questoes/2024-*'], maximumFileSizeToCacheInBytes: 5000000 },
    }),
  ],
});