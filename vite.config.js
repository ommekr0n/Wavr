import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/r2-proxy': {
        target: 'https://pub-ad9d2da16833484899017a239642b570.r2.dev',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/r2-proxy/, '')
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-aws': ['@aws-sdk/client-s3'],
          'vendor-twemoji': ['@twemoji/api']
        }
      }
    }
  }
});
