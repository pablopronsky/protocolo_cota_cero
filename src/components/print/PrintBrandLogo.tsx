interface Props {
  inverse?: boolean;
  className?: string;
}

export function PrintBrandLogo({ inverse = false, className = '' }: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={inverse ? '/brand/cota-cero-primary-light.svg' : '/brand/cota-cero-primary-dark.svg'}
      alt="COTA CERO - Superficies y terminaciones"
      className={className}
    />
  );
}
