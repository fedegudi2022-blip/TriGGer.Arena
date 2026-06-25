import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  output: 'server',
  adapter: vercel({
    // Incluir dependencias nativas que Vercel no bundlea automáticamente
    includeFiles: [],
    isr: false,
  }),
  compressHTML: true,
  vite: {
    ssr: {
      // gamedig y nodemailer son CJS puro con bindings nativos.
      // noExternal los fuerza a ser bundleados dentro del chunk de Vercel.
      noExternal: ['nodemailer'],
      external: ['gamedig', '@anthropic-ai/sdk', 'mysql2'],
    },
    optimizeDeps: {
      exclude: ['@anthropic-ai/sdk', 'gamedig'],
    },
    build: {
      // Minificación y splitting agresivo
      minify: 'esbuild',
      cssMinify: true,
      rollupOptions: {
        output: {
          // Separar vendor chunks para mejor cache del browser
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
