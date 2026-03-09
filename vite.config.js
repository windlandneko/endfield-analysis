import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    target: 'esnext',
    minify: true,
    rollupOptions: {
      output: {
        entryFileNames: 'index.js',
        format: 'es',
      },
    },
  },
  base: 'https://endfield.windlandneko.com/analysis/',
})