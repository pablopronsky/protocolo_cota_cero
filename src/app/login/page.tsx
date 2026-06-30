'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { setPersistence, browserLocalPersistence, browserSessionPersistence, sendPasswordResetEmail } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { login } from '@/hooks/useAuth';

// ── Icons ──────────────────────────────────────────────────────────────────
const IconMail = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M1.5 5.5l6.5 4 6.5-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);
const IconLock = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);
const IconEye = ({ off }: { off: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M1 8C1 8 3.5 3 8 3s7 5 7 5-2.5 5-7 5S1 8 1 8z" stroke="currentColor" strokeWidth="1.3"/>
    <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3"/>
    {off && <path d="M2 2l12 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>}
  </svg>
);
const IconArrow = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// ── Logo component ─────────────────────────────────────────────────────────
function CotaCeroLogo({ color = '#F5F2ED', size = 20 }: { color?: string; size?: number }) {
  const axisH = size * 0.82;
  const sq = Math.max(5, size * 0.16);
  const gap = size * 0.33;
  return (
    <div style={{ display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
      <span style={{ fontSize: size, fontWeight: 800, letterSpacing: '0.155em', color, textTransform: 'uppercase', lineHeight: 1 }}>
        COTA
      </span>
      <div style={{ width: 1, height: axisH, background: '#C38A5A', margin: `0 ${gap}px`, flexShrink: 0, position: 'relative' }}>
        <div style={{ position: 'absolute', width: sq, height: sq, background: '#C38A5A', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }} />
      </div>
      <span style={{ fontSize: size, fontWeight: 800, letterSpacing: '0.155em', color, textTransform: 'uppercase', lineHeight: 1 }}>
        CERO
      </span>
    </div>
  );
}

// ── Protocol steps ─────────────────────────────────────────────────────────
const STEPS = [
  { num: '01', label: 'DIAGNÓSTICO', active: true },
  { num: '02', label: 'PREPARACIÓN', active: false },
  { num: '03', label: 'EJECUCIÓN',   active: false },
  { num: '04', label: 'CONTROL',     active: false },
  { num: '05', label: 'ENTREGA',     active: false },
];

// ── Shared styles ──────────────────────────────────────────────────────────
const INPUT: React.CSSProperties = {
  width: '100%',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 2,
  padding: '13px 16px 13px 42px',
  background: 'rgba(255,255,255,0.03)',
  color: '#F5F2ED',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'Roboto, Arial, sans-serif',
  letterSpacing: '0.02em',
  transition: 'border-color 0.15s',
};
const LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: 9,
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.28em',
  color: '#C38A5A',
  marginBottom: 8,
  fontFamily: 'Roboto, Arial, sans-serif',
};
const ICON_WRAP: React.CSSProperties = {
  position: 'absolute', left: 15, top: '50%',
  transform: 'translateY(-50%)',
  color: 'rgba(184,174,163,0.32)', pointerEvents: 'none',
};

export default function LoginPage() {
  const router = useRouter();
  const [email,         setEmail]         = useState('');
  const [password,      setPassword]      = useState('');
  const [showPwd,       setShowPwd]       = useState(false);
  const [remember,      setRemember]      = useState(true);
  const [error,         setError]         = useState('');
  const [loading,       setLoading]       = useState(false);
  const [forgotMode,    setForgotMode]    = useState(false);
  const [forgotEmail,   setForgotEmail]   = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const auth = getFirebaseAuth();
      await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
      await login(email, password);
      router.replace('/projects');
    } catch {
      setError('Email o contraseña incorrectos.');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e: FormEvent) {
    e.preventDefault();
    if (!forgotEmail.trim()) { setError('Ingresá tu email.'); return; }
    setForgotLoading(true);
    setError('');
    setForgotSuccess(false);
    try {
      const auth = getFirebaseAuth();
      await sendPasswordResetEmail(auth, forgotEmail);
      setForgotSuccess(true);
      setForgotEmail('');
      setTimeout(() => setForgotMode(false), 3000);
    } catch {
      setError('No encontramos una cuenta con ese email.');
    } finally {
      setForgotLoading(false);
    }
  }

  function resetForgot() {
    setForgotMode(false);
    setError('');
    setForgotEmail('');
    setForgotSuccess(false);
  }

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }

        .cc-input { border-color: rgba(255,255,255,0.07) !important; }
        .cc-input:focus { border-color: #C38A5A !important; box-shadow: 0 0 0 3px rgba(195,138,90,0.08); }
        .cc-input::placeholder { color: rgba(184,174,163,0.28); }

        .cc-btn-primary { background: #C38A5A; color: #0C0C0C; }
        .cc-btn-primary:hover:not(:disabled) { background: #ce9666 !important; }
        .cc-btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }

        .cc-btn-ghost:hover { border-color: rgba(195,138,90,0.35) !important; color: rgba(245,242,237,0.75) !important; }
        .cc-link:hover { color: #C38A5A !important; }

        @media (max-width: 1023px) {
          .cc-left  { display: none !important; }
          .cc-right { width: 100% !important; }
        }
      `}</style>

      <div style={{
        display: 'flex', height: '100dvh', width: '100%',
        backgroundColor: '#0C0C0C', overflow: 'hidden',
        fontFamily: 'Roboto, Arial, sans-serif',
      }}>

        {/* ══════════════════════════════════════════════════════
            LEFT PANEL — foto + overlays técnicos
        ══════════════════════════════════════════════════════ */}
        <div
          className="cc-left"
          style={{
            width: '58%', flexShrink: 0, position: 'relative', overflow: 'hidden',
            backgroundImage: 'url(/img/login/755ab2a8-6705-4e2f-98c8-9f94eec625bb.png)',
            backgroundSize: 'cover', backgroundPosition: 'center',
            backgroundColor: '#0A0A0A',
          }}
        >
          {/* Vignette */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: `
              linear-gradient(to right,  rgba(12,12,12,0.68) 0%, rgba(12,12,12,0.00) 40%),
              linear-gradient(to top,    rgba(12,12,12,0.85) 0%, rgba(12,12,12,0.00) 38%),
              linear-gradient(to bottom, rgba(12,12,12,0.45) 0%, rgba(12,12,12,0.00) 22%)
            `,
          }} />

          {/* Grid overlay */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage: `
              linear-gradient(90deg, rgba(195,138,90,0.055) 1px, transparent 1px),
              linear-gradient(0deg,  rgba(195,138,90,0.04)  1px, transparent 1px)
            `,
            backgroundSize: '84px 84px',
          }} />

          {/* ── Logo ── */}
          <div style={{ position: 'absolute', top: 36, left: 40, zIndex: 10 }}>
            <CotaCeroLogo color="#F5F2ED" size={22} />
            <div style={{
              marginTop: 10, display: 'flex', alignItems: 'center', gap: 9,
            }}>
              <div style={{ width: 32, height: 1, background: '#C38A5A', opacity: 0.55 }} />
              <span style={{
                fontSize: 8, fontWeight: 800, letterSpacing: '0.34em',
                textTransform: 'uppercase', color: '#C38A5A',
              }}>Protocolo de Obra</span>
              <div style={{ width: 32, height: 1, background: '#C38A5A', opacity: 0.55 }} />
            </div>
          </div>

          {/* ── Annotation: vertical measurement ── */}
          <div style={{
            position: 'absolute', right: 80, top: '18%',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            pointerEvents: 'none', zIndex: 10,
          }}>
            {/* top dot */}
            <div style={{ width: 5, height: 5, background: '#C38A5A', opacity: 0.75 }} />
            {/* dashed line */}
            <div style={{
              width: 1, height: 160,
              background: 'repeating-linear-gradient(180deg,#C38A5A 0,#C38A5A 5px,transparent 5px,transparent 9px)',
              opacity: 0.40,
            }} />
            {/* bottom dot */}
            <div style={{ width: 5, height: 5, background: '#C38A5A', opacity: 0.75 }} />
          </div>

          {/* Measurement label: 2500 mm */}
          <div style={{
            position: 'absolute', right: 96, top: 'calc(18% + 16px)',
            display: 'flex', alignItems: 'center', gap: 6,
            pointerEvents: 'none', zIndex: 10,
          }}>
            <div style={{ width: 3, height: 3, background: '#C38A5A', opacity: 0.65, flexShrink: 0 }} />
            <span style={{
              fontSize: 8, color: 'rgba(195,138,90,0.72)', fontWeight: 700,
              letterSpacing: '0.14em', background: 'rgba(12,12,12,0.52)',
              padding: '2px 7px',
            }}>2500 mm</span>
          </div>

          {/* Tolerance tag: TOL ±2 mm */}
          <div style={{
            position: 'absolute', right: 52, bottom: '30%',
            border: '1px solid rgba(195,138,90,0.42)',
            padding: '5px 9px',
            display: 'flex', alignItems: 'center', gap: 7,
            background: 'rgba(12,12,12,0.58)',
            pointerEvents: 'none', zIndex: 10,
          }}>
            <div style={{ width: 4, height: 4, background: '#C38A5A', opacity: 0.80, flexShrink: 0 }} />
            <span style={{
              fontSize: 8, color: 'rgba(195,138,90,0.85)', fontWeight: 800,
              letterSpacing: '0.16em', textTransform: 'uppercase',
            }}>TOL ±2 mm</span>
          </div>

          {/* ── Protocol Steps Bar ── */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
            background: 'rgba(8,8,8,0.88)',
            borderTop: '1px solid rgba(195,138,90,0.16)',
            padding: '16px 40px 20px',
            backdropFilter: 'blur(10px)',
          }}>
            <div style={{ display: 'flex' }}>
              {STEPS.map((s, i) => (
                <div key={s.num} style={{
                  flex: 1,
                  paddingRight: i < STEPS.length - 1 ? 20 : 0,
                  display: 'flex', flexDirection: 'column', gap: 5,
                }}>
                  <span style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: '0.20em',
                    color: s.active ? '#C38A5A' : 'rgba(184,174,163,0.28)',
                  }}>{s.num}</span>
                  <span style={{
                    fontSize: 7.5, fontWeight: 700, letterSpacing: '0.16em',
                    color: s.active ? 'rgba(245,242,237,0.88)' : 'rgba(184,174,163,0.28)',
                    textTransform: 'uppercase',
                  }}>{s.label}</span>
                  <div style={{
                    height: 1,
                    background: s.active ? '#C38A5A' : 'rgba(184,174,163,0.10)',
                  }} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            RIGHT PANEL — formulario
        ══════════════════════════════════════════════════════ */}
        <div
          className="cc-right"
          style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            backgroundColor: '#0C0C0C',
            borderLeft: '1px solid rgba(195,138,90,0.09)',
            minWidth: 0,
          }}
        >
          {/* Form area */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '48px 44px',
          }}>
            <div style={{ width: '100%', maxWidth: 372 }}>

              {!forgotMode ? (
                /* ── Login form ── */
                <>
                  <div style={{ marginBottom: 32 }}>
                    <p style={{
                      fontSize: 8, fontWeight: 800, letterSpacing: '0.28em',
                      textTransform: 'uppercase', color: '#C38A5A',
                      margin: '0 0 8px',
                    }}>Acceso</p>
                    <h1 style={{
                      fontSize: 26, fontWeight: 800, color: '#F5F2ED',
                      letterSpacing: '0.10em', textTransform: 'uppercase',
                      lineHeight: 1.08, margin: '0 0 10px',
                    }}>Iniciar Sesión</h1>
                    <p style={{ fontSize: 13, color: 'rgba(184,174,163,0.50)', margin: 0, lineHeight: 1.55 }}>
                      Ingresá para acceder al Protocolo de Obra.
                    </p>
                  </div>

                  {/* Accent divider */}
                  <div style={{
                    height: 1, marginBottom: 30,
                    background: 'linear-gradient(90deg, #C38A5A 24px, rgba(195,138,90,0.07) 100%)',
                  }} />

                  <form onSubmit={handleSubmit}>
                    {/* Email */}
                    <div style={{ marginBottom: 18 }}>
                      <label htmlFor="email" style={LABEL}>Email</label>
                      <div style={{ position: 'relative' }}>
                        <span style={ICON_WRAP}><IconMail /></span>
                        <input
                          id="email" type="email" value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required autoComplete="email"
                          placeholder="tu@email.com"
                          className="cc-input"
                          style={INPUT}
                        />
                      </div>
                    </div>

                    {/* Contraseña */}
                    <div style={{ marginBottom: 14 }}>
                      <label htmlFor="password" style={LABEL}>Contraseña</label>
                      <div style={{ position: 'relative' }}>
                        <span style={ICON_WRAP}><IconLock /></span>
                        <input
                          id="password"
                          type={showPwd ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required autoComplete="current-password"
                          className="cc-input"
                          style={{ ...INPUT, paddingRight: 44 }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPwd(!showPwd)}
                          aria-label={showPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                          style={{
                            position: 'absolute', right: 14, top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'transparent', border: 'none', padding: 4,
                            color: 'rgba(184,174,163,0.32)', cursor: 'pointer',
                            transition: 'color 0.15s',
                          }}
                        >
                          <IconEye off={showPwd} />
                        </button>
                      </div>
                    </div>

                    {/* Recordarme + Olvidé */}
                    <div style={{
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'space-between', marginBottom: 22,
                    }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <input
                          type="checkbox" checked={remember}
                          onChange={(e) => setRemember(e.target.checked)}
                          style={{ width: 14, height: 14, accentColor: '#C38A5A', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: 11, color: 'rgba(184,174,163,0.50)', letterSpacing: '0.06em' }}>
                          Recordarme
                        </span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setForgotMode(true)}
                        className="cc-link"
                        style={{
                          fontSize: 11, color: 'rgba(195,138,90,0.60)',
                          background: 'transparent', border: 'none',
                          cursor: 'pointer', letterSpacing: '0.04em',
                          transition: 'color 0.15s',
                        }}
                      >
                        ¿Olvidaste tu contraseña?
                      </button>
                    </div>

                    {/* Error */}
                    {error && (
                      <div style={{
                        fontSize: 11, color: '#f87171', marginBottom: 14,
                        padding: '10px 14px', borderRadius: 2,
                        border: '1px solid rgba(248,113,113,0.18)',
                        background: 'rgba(248,113,113,0.05)',
                        letterSpacing: '0.04em',
                      }}>
                        {error}
                      </div>
                    )}

                    {/* Submit */}
                    <button
                      type="submit"
                      disabled={loading}
                      className="cc-btn-primary"
                      style={{
                        width: '100%', fontWeight: 800, fontSize: 10,
                        textTransform: 'uppercase', letterSpacing: '0.26em',
                        border: 'none', borderRadius: 2, padding: '15px 0',
                        fontFamily: 'Roboto, Arial, sans-serif',
                        cursor: 'pointer', transition: 'background 0.15s',
                        display: 'flex', alignItems: 'center',
                        justifyContent: 'center', gap: 10,
                      }}
                    >
                      {loading ? 'Ingresando…' : <><span>Ingresar</span><IconArrow /></>}
                    </button>
                  </form>
                </>
              ) : (
                /* ── Forgot password form ── */
                <>
                  <div style={{ marginBottom: 32 }}>
                    <p style={{
                      fontSize: 8, fontWeight: 800, letterSpacing: '0.28em',
                      textTransform: 'uppercase', color: '#C38A5A', margin: '0 0 8px',
                    }}>Recuperar acceso</p>
                    <h1 style={{
                      fontSize: 24, fontWeight: 800, color: '#F5F2ED',
                      letterSpacing: '0.10em', textTransform: 'uppercase',
                      lineHeight: 1.08, margin: '0 0 10px',
                    }}>Restablecer</h1>
                    <p style={{ fontSize: 13, color: 'rgba(184,174,163,0.50)', margin: 0, lineHeight: 1.55 }}>
                      Ingresá tu email para recibir un enlace de recuperación.
                    </p>
                  </div>

                  <div style={{
                    height: 1, marginBottom: 30,
                    background: 'linear-gradient(90deg, #C38A5A 24px, rgba(195,138,90,0.07) 100%)',
                  }} />

                  <form onSubmit={handleForgotPassword}>
                    <div style={{ marginBottom: 20 }}>
                      <label htmlFor="forgot-email" style={LABEL}>Email</label>
                      <div style={{ position: 'relative' }}>
                        <span style={ICON_WRAP}><IconMail /></span>
                        <input
                          id="forgot-email" type="email" value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          required autoComplete="email"
                          placeholder="tu@email.com"
                          className="cc-input"
                          style={INPUT}
                        />
                      </div>
                    </div>

                    {error && (
                      <div style={{
                        fontSize: 11, color: '#f87171', marginBottom: 14,
                        padding: '10px 14px', borderRadius: 2,
                        border: '1px solid rgba(248,113,113,0.18)',
                        background: 'rgba(248,113,113,0.05)',
                        letterSpacing: '0.04em',
                      }}>{error}</div>
                    )}

                    {forgotSuccess && (
                      <div style={{
                        fontSize: 11, color: '#86efac', marginBottom: 14,
                        padding: '10px 14px', borderRadius: 2,
                        border: '1px solid rgba(134,239,172,0.18)',
                        background: 'rgba(134,239,172,0.05)',
                        letterSpacing: '0.04em',
                      }}>Enlace enviado. Revisá tu email.</div>
                    )}

                    <button
                      type="submit"
                      disabled={forgotLoading}
                      className="cc-btn-primary"
                      style={{
                        width: '100%', fontWeight: 800, fontSize: 10,
                        textTransform: 'uppercase', letterSpacing: '0.26em',
                        border: 'none', borderRadius: 2, padding: '15px 0',
                        fontFamily: 'Roboto, Arial, sans-serif',
                        cursor: 'pointer', transition: 'background 0.15s',
                        marginBottom: 10,
                      }}
                    >
                      {forgotLoading ? 'Enviando…' : 'Enviar enlace'}
                    </button>

                    <button
                      type="button"
                      onClick={resetForgot}
                      className="cc-btn-ghost"
                      style={{
                        width: '100%', background: 'transparent',
                        border: '1px solid rgba(255,255,255,0.07)', borderRadius: 2,
                        padding: '13px 0', color: 'rgba(245,242,237,0.38)',
                        fontSize: 10, fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: '0.22em',
                        cursor: 'pointer', fontFamily: 'Roboto, Arial, sans-serif',
                        transition: 'border-color 0.15s, color 0.15s',
                      }}
                    >
                      Volver
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>

          {/* ── System info footer ── */}
          <div style={{
            padding: '18px 44px 22px',
            borderTop: '1px solid rgba(195,138,90,0.09)',
          }}>
            <p style={{
              fontSize: 8, fontWeight: 800, letterSpacing: '0.28em',
              textTransform: 'uppercase', color: '#C38A5A', margin: '0 0 5px',
            }}>Sistema</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: 11, fontWeight: 800, letterSpacing: '0.18em',
                textTransform: 'uppercase', color: 'rgba(245,242,237,0.62)',
              }}>Protocolo de Obra</span>
              <div style={{ width: 1, height: 10, background: 'rgba(195,138,90,0.28)', flexShrink: 0 }} />
              <span style={{
                fontSize: 10, color: 'rgba(184,174,163,0.32)',
                letterSpacing: '0.08em', fontFamily: 'monospace',
              }}>v2.6.6</span>
              <div style={{ width: 1, height: 10, background: 'rgba(195,138,90,0.28)', flexShrink: 0 }} />
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
                textTransform: 'uppercase', color: 'rgba(184,174,163,0.32)',
              }}>Argentina</span>
            </div>
          </div>
        </div>

      </div>
    </>
  );
}
