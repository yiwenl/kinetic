import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: 'test',
  resolve: {
    alias: {
      // Alias to resolve the package import to the source code for development
      'kinetic': path.resolve(__dirname, 'src/index.ts')
    }
  },
  server: {
    open: true
  }
});
