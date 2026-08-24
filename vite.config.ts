import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { campusApiPlugin } from './vite-plugin-campus-api.ts'

export default defineConfig({
  base: './',
  server: {
    host: true, // 监听所有网卡，允许局域网/其他设备通过 IP 访问
    port: 5173,
  },
  plugins: [campusApiPlugin()],
  build: {
    rolldownOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        editor: resolve(__dirname, 'editor.html'),
      },
      output: {
        // Keep Three.js and the shared renderer independently cacheable. The
        // editor and the public map both use them, while their entry modules
        // remain small enough to load quickly on the first visit.
        codeSplitting: {
          groups: [
            { name: 'three-vendor', test: /node_modules[\\/]three[\\/]/ },
            { name: 'scene', test: /src[\\/]scene[\\/]/ },
          ],
        },
      },
    },
  },
})
