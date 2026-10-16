/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * `vite build --mode panel` (npm run build:panel): the After Effects CEP panel in dist-panel/.
 * CEP loads index.html from file://, where module scripts and crossorigin requests are blocked, so the
 * bundle is a single classic script and the manifest and host script are copied next to it.
 */
function cepPanel(): Plugin {
  const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
  // CEP wants a dotted numeric version; keep the major.minor.patch part.
  const bundleVersion = /^\d+\.\d+\.\d+/.exec(version)?.[0] ?? '0.0.0';
  return {
    name: 'expressionlab-cep-panel',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (html) =>
        html
          .replace(/<script type="module" crossorigin/g, '<script defer')
          .replace(/<link rel="modulepreload"[^>]*>/g, '')
          .replace(/ crossorigin/g, ''),
    },
    generateBundle() {
      const emit = (fileName: string, source: string) => this.emitFile({ type: 'asset', fileName, source });
      emit('CSXS/manifest.xml', readFileSync('cep/CSXS/manifest.xml', 'utf8').replaceAll('%VERSION%', bundleVersion));
      emit('host/host.jsx', readFileSync('cep/host/host.jsx', 'utf8'));
      if (process.env.PANEL_DEBUG) emit('.debug', readFileSync('cep/.debug', 'utf8'));
    },
  };
}

export default defineConfig(({ mode }) => {
  const panel = mode === 'panel';
  return {
    // GitHub Pages serves the app from /<repo>/; the deploy workflow sets BASE_PATH. Local dev stays at /.
    base: panel ? './' : (process.env.BASE_PATH ?? '/'),
    plugins: [react(), panel && cepPanel()],
    build: panel
      ? {
          outDir: 'dist-panel',
          // CEP 11 (AE 2022) runs Chromium 88.
          target: 'chrome88',
          modulePreload: false,
          rollupOptions: { output: { format: 'iife', inlineDynamicImports: true } },
        }
      : undefined,
    test: {
      include: ['tests/**/*.test.ts'],
      environment: 'node',
    },
  };
});
