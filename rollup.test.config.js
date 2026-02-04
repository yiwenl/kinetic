import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default [
  {
    input: 'test/demo.js',
    output: {
      file: 'test/bundle.js',
      format: 'iife',
      name: 'demo'
    },
    plugins: [
      resolve(),
      commonjs()
    ]
  }
];
