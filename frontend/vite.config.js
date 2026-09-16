import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'axios', 'lucide-react'],
  },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:4001', changeOrigin: true },
      '/uploads': { target: 'http://localhost:4001', changeOrigin: true },
    },
  },
  build: {
    target: 'esnext',
    cssMinify: true,
    cssCodeSplit: true,
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    reportCompressedSize: true,
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
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
