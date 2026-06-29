interface LogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

const SIZES = {
  xs: { fontSize: 15, dotSize: 4 },
  sm: { fontSize: 18, dotSize: 5 },
  md: { fontSize: 23, dotSize: 6 },
  lg: { fontSize: 49, dotSize: 9 },
};

export default function Logo({ size = 'sm' }: LogoProps) {
  const { fontSize, dotSize } = SIZES[size];

  return (
    <span
      className="inline-flex items-center font-bold uppercase select-none"
      style={{ fontSize, letterSpacing: '0.155em', lineHeight: 1 }}
    >
      COTA
      {/* Vertical axis — always copper, text color inherited for the words */}
      <span
        style={{
          display: 'inline-block',
          position: 'relative',
          width: 1,
          height: '0.82em',
          margin: '0 0.32em',
          background: '#C38A5A',
          flexShrink: 0,
        }}
      >
        {/* Micro-square centered on the axis */}
        <span
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'block',
            width: dotSize,
            height: dotSize,
            background: '#C38A5A',
          }}
        />
      </span>
      CERO
    </span>
  );
}
