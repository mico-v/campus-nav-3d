import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { campusApiPlugin } from './vite-plugin-campus-api.ts'

export default defineConfig({
  base: './',
  plugins: [campusApiPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        editor: resolve(__dirname, 'editor.html'),
      },
    },
  },
})
