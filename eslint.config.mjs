import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Canvas de firma no tiene alternativa de teclado aún (pendiente Tier 3)
      'jsx-a11y/no-autofocus': 'off',
      // React Hook Form is safely skipped by React Compiler; this project
      // does not enable the compiler, so the informational warning is noise.
      'react-hooks/incompatible-library': 'off',
      'react-hooks/set-state-in-effect': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'output/**',
    'next-env.d.ts',
  ]),
]);
