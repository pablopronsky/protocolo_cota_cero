import { FlatCompat } from '@eslint/eslintrc';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

export default [
  ...compat.extends('next/core-web-vitals', 'plugin:jsx-a11y/recommended'),
  {
    rules: {
      // Canvas de firma no tiene alternativa de teclado aún (pendiente Tier 3)
      'jsx-a11y/no-autofocus': 'off',
    },
  },
];
