import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  root: 'overlay.src',
  publicDir: false,
  plugins: [vue(), viteSingleFile()],
  build: {
    outDir: '../overlay.dist',
  },
});
