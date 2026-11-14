// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

import react from '@astrojs/react';

import cloudflare from '@astrojs/cloudflare';

import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://healthsaral.in',
  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [react(), sitemap({
    filter: (page) => !page.includes('/dashboard') && !page.includes('/report/') && !page.includes('/api/'),
  })],

  trailingSlash: 'always',

  adapter: cloudflare(),
});