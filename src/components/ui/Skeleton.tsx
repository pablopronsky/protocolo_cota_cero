export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-[#B8AEA3]/20 rounded ${className}`} />;
}
