import type { NextConfig } from "next";

const securityHeaders = [
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'X-Frame-Options',           value: 'SAMEORIGIN' },
  { key: 'X-XSS-Protection',          value: '1; mode=block' },
  { key: 'Referrer-Policy',            value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',         value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
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
