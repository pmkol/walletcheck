import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 21000, strictPort: true },
  preview: { port: 21000, strictPort: true },
  build: {
    copyPublicDir: false,
    target: 'es2022',
    lib: {
      entry: { index: 'src/index.ts', element: 'src/element.ts', modal: 'src/modal.ts' },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
  },
});
