import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  output: 'server',
  adapter: vercel({
    includeFiles: [],
    isr: false,
    // ✅ Habilita edge middleware para respuestas más rápidas
    edgeMiddleware: false,
    functionPerRoute: false,
  }),
  compressHTML: true,
  // ✅ Prefetch habilitado para navegación más rápida
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover',
  },
  vite: {
    ssr: {
      noExternal: ['nodemailer'],
      external: ['gamedig', '@anthropic-ai/sdk', 'mysql2'],
    },
    optimizeDeps: {
      exclude: ['@anthropic-ai/sdk', 'gamedig'],
    },
    build: {
      minify: 'esbuild',
      cssMinify: true,
      // ✅ Target moderno — elimina polyfills innecesarios
      target: 'es2020',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('mysql2')) return 'vendor-mysql';
              if (id.includes('@fontsource')) return 'vendor-fonts';
              return 'vendor';
            }
          },
        },
      },
    },
  },
});