import typescript from '@rollup/plugin-typescript';

export default {
  input: 'src/main.ts',
  output: {
    file: 'build/index.js',
    format: 'cjs',
  },
  external: ['nakama-runtime'],
  plugins: [
    typescript({
      tsconfig: './tsconfig.json',
    }),
  ],
};
