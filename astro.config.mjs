import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  output: 'server',
  adapter: vercel(),
  compressHTML: true,
  vite: {
    ssr: {
      external: ['gamedig', '@anthropic-ai/sdk'],
    },
    optimizeDeps: {
      exclude: ['@anthropic-ai/sdk'],
    }
  }
});