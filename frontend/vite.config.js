import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:4001', changeOrigin: true },
      '/uploads': { target: 'http://localhost:4001', changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        /**
         * Smart chunk splitting strategy:
         *
         * Previously all node_modules were lumped into a single `vendor` chunk.
         * This blocked rendering until the entire bundle loaded — even on pages
         * that don't use recharts or react-pdf.
         *
         * New strategy: split heavy deps into their own lazy chunks so they
         * only download when the pages that use them are visited.
         *
         * Chunk targets (all gzip targets <250KB):
         *   chunk-react    — react, react-dom, react-router-dom (always needed)
         *   chunk-charts   — recharts + dependencies (only on dashboard/payroll pages)
         *   chunk-pdf      — @react-pdf/renderer (only on payslip pages)
         *   vendor         — all other node_modules (lodash, axios, lucide, etc.)
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          // Heavy charting library — only loaded on pages that render charts
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory')) {
            return 'chunk-charts';
          }

          // PDF renderer — only loaded on /payslip/* pages
          if (
            id.includes('@react-pdf') ||
            id.includes('react-pdf') ||
            id.includes('pdfjs-dist')
          ) {
            return 'chunk-pdf';
          }

          // Core React runtime — always present, small, cached aggressively
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router-dom/') ||
            id.includes('node_modules/scheduler/')
          ) {
            return 'chunk-react';
          }

          // Everything else (lucide, axios, date-fns, etc.) → shared vendor chunk
          return 'vendor';
        },
      },
    },
  },
})
