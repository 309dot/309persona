import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@assets': path.resolve(import.meta.dirname, './src/assets'),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Only React core gets a fixed chunk; everything else follows the import graph, so
          // lazily loaded code (markdown renderer, admin dashboard + Firebase) stays out of the entry.
          groups: [
            {
              name: 'react-vendor',
              test: /[\\/]node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/,
            },
          ],
        },
      },
    },
  },
});
