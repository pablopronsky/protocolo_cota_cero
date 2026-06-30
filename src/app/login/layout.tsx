import { Montserrat } from 'next/font/google';

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
});

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <div className={montserrat.className}>{children}</div>;
}
