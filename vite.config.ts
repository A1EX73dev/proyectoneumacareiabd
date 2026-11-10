import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { agentApi } from './server/vitePlugin';

export default defineConfig({
  plugins: [react(), agentApi()],
  build: {
    // three.js ocupa ~600 kB por sí solo; se separa en su propio chunk y se carga en diferido.
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
});
