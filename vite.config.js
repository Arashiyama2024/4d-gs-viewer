import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages にデプロイする場合、リポジトリ名を base に設定
// 例: https://USERNAME.github.io/4d-gs-viewer/
// ※ リポジトリ名を変更した場合はここも合わせて変更してください
export default defineConfig({
  plugins: [react()],
  base: '/4d-gs-viewer/',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
