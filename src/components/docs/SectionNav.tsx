export interface SectionInfo {
  id: string;
  label: string;
  done?: boolean;
}

// #18 — Rail de navegación por anclas + completitud aproximada (heurística por
// campos representativos de cada sección, no una validación exhaustiva: esa
// sigue viviendo en handleLock). Sirve para orientarse en formularios largos.
export function SectionNav({ sections }: { sections: SectionInfo[] }) {
  if (!sections.length) return null;
  return (
    <nav className="flex flex-wrap gap-1.5 no-print" aria-label="Secciones del formulario">
      {sections.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.1em] border transition-colors duration-150 ${
            s.done
              ? 'border-[#C38A5A]/40 text-[#7B4A28] bg-[#C38A5A]/10'
              : 'border-[rgba(43,45,47,0.15)] text-[#6B6155]'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.done ? 'bg-[#C38A5A]' : 'bg-[rgba(43,45,47,0.25)]'}`} />
          {s.label}
        </a>
      ))}
    </nav>
  );
}
