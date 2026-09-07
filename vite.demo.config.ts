import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  publicDir: false,
  preview: { host: '0.0.0.0', port: 21000, strictPort: true },
  build: {
    outDir: 'dist-demo',
    target: 'es2022',
  },
  plugins: [{
    name: 'static-site-marker',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '.nojekyll', source: '' });
    },
  }],
});
