import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const DEFAULT_GITHUB_BASE = '/english-web/';

/** GitHub Pages serves project sites under /<repo>/, so the base must follow the repository name. */
function pagesBase(): string {
  const configured = process.env.GITHUB_PAGES_BASE?.trim() || DEFAULT_GITHUB_BASE;
  const withSlash = configured.startsWith('/') ? configured : `/${configured}`;
  return withSlash.endsWith('/') ? withSlash : `${withSlash}/`;
}

export default defineConfig(({ mode }) => {
  const base = mode === 'github' ? pagesBase() : '/';
  return {
    base,
    plugins: [
      react(),
      VitePWA({
        scope: base,
        registerType: 'prompt',
        includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
        manifest: {
          name: '英语学习',
          short_name: '英语学习',
          description: '按课程学习、自动保存、按规则复习',
          lang: 'zh-CN',
          start_url: base,
          scope: base,
          display: 'standalone',
          orientation: 'portrait-primary',
          theme_color: '#1f2430',
          background_color: '#faf9f7',
          icons: [
            { src: `${base}icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{html,js,css,svg,png,woff2}'],
          navigateFallback: 'index.html'
        }
      })
    ]
  };
});
