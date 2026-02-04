import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/kinetic.esm.js',
      format: 'es',
      sourcemap: true,
    },
    {
      file: 'dist/kinetic.umd.js',
      format: 'umd',
      name: 'kinetic',
      sourcemap: true
    }
  ],
  external: [], 
  plugins: [
    resolve(),
    commonjs(),
    typescript({ tsconfig: './tsconfig.json' })
  ]
};
