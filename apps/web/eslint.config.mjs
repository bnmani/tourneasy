import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

// eslint-config-next 16 ships flat configs; no FlatCompat needed.
const config = [{ ignores: ['.next/**', 'next-env.d.ts'] }, ...nextVitals, ...nextTypescript];

export default config;
