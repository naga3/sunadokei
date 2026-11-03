import { defineConfig } from 'vite'
import { execFile } from 'node:child_process'

// 画面の文が変わったら、ゲームのフォント（src/font.js。使う字だけ）を作り直す。中身が同じなら書かない
const font = () => ({
  name: 'font',
  configureServer(server) {
    server.watcher.on('change', (f) => {
      if (/[\\/]src[\\/]/.test(f) && !/(font|art|bgm)\.js$/.test(f)) execFile('node', ['tools/font.mjs'], () => {})
    })
  },
})

// ポートは ~/src/etc/PORTS.md の一覧から 5194
export default defineConfig({ base: './', plugins: [font()], server: { port: 5194, strictPort: true }, preview: { port: 5194, strictPort: true }, clearScreen: false })
