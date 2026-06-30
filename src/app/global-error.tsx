'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100dvh', backgroundColor: '#F5F2ED',
        fontFamily: 'Roboto, sans-serif', margin: 0,
      }}>
        <div style={{ textAlign: 'center', padding: '2rem', maxWidth: 400 }}>
          <div style={{ width: 40, height: 2, background: '#C38A5A', margin: '0 auto 1.5rem' }} />
          <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.28em', textTransform: 'uppercase', color: '#C38A5A', marginBottom: '0.5rem' }}>
            Error
          </p>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#2B2D2F', marginBottom: '0.75rem' }}>
            Algo salió mal
          </h1>
          <p style={{ fontSize: 13, color: '#6B6155', marginBottom: '1.5rem', lineHeight: 1.6 }}>
            {error.message || 'Error inesperado. Por favor intentá de nuevo.'}
            {error.digest && (
              <span style={{ display: 'block', fontFamily: 'monospace', fontSize: 11, marginTop: '0.5rem' }}>
                ref: {error.digest}
              </span>
            )}
          </p>
          <button
            onClick={reset}
            style={{
              background: '#2B2D2F', color: '#F5F2ED', border: 'none',
              borderRadius: 4, padding: '10px 24px', fontSize: 10,
              fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
