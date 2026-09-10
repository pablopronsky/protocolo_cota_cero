import type { NextConfig } from "next";

const securityHeaders = [
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'X-Frame-Options',           value: 'SAMEORIGIN' },
  { key: 'X-XSS-Protection',          value: '1; mode=block' },
  { key: 'Referrer-Policy',            value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',         value: 'camera=(), microphone=(), geolocation=()' },
];

if (process.env.VERCEL && process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === '1') {
  throw new Error('No se permite desplegar una build de emuladores.');
}

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === '1' ? '.next-test' : '.next',
  turbopack: {},
  // google-gax (usado por firebase-admin/firestore) carga sus .proto a runtime
  // con paths dinámicos, que el file tracer de Next no detecta. Sin esto, el
  // bundle serverless de Netlify queda incompleto y las rutas que usan
  // getAdminDb()/getAdminAuth() rompen en producción con 500 "Internal Server Error".
  outputFileTracingIncludes: {
    '/api/**': ['./node_modules/google-gax/build/protos/**/*'],
  },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
