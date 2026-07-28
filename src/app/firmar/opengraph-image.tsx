import { ImageResponse } from 'next/og';

export const alt = 'Acta de conformidad de obra · COTA CERO';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '70px 76px',
        background: '#202123',
        color: '#F5F2ED',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          right: '-80px',
          top: '-110px',
          width: '520px',
          height: '520px',
          border: '1px solid rgba(195,138,90,0.24)',
          borderRadius: '50%',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', fontSize: 38, fontWeight: 800, letterSpacing: '0.16em' }}>
        COTA<span style={{ color: '#C38A5A', margin: '0 10px' }}>·</span>CERO
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '880px' }}>
        <span style={{ color: '#C38A5A', fontSize: 22, fontWeight: 800, letterSpacing: '0.24em', textTransform: 'uppercase' }}>
          Cierre de obra
        </span>
        <span style={{ marginTop: 20, fontSize: 76, fontWeight: 800, lineHeight: 1.02, letterSpacing: '-0.025em' }}>
          Acta de conformidad
        </span>
        <span style={{ marginTop: 24, color: '#CFC7BD', fontSize: 28, lineHeight: 1.4 }}>
          Revisá el trabajo realizado y firmá desde tu celular.
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(245,242,237,0.14)', paddingTop: 25 }}>
        <span style={{ color: '#B8AEA3', fontSize: 18, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Documento privado</span>
        <span style={{ color: '#C38A5A', fontSize: 18, fontWeight: 700 }}>SUPERFICIES Y TERMINACIONES</span>
      </div>
    </div>,
    size,
  );
}
