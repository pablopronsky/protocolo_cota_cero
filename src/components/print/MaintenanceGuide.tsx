import type { Project } from '@/schemas';
import type { Snapshot } from './PrintDocument';
import { formatMaterialForClient } from '@/lib/material';

interface Props {
  project: Project;
  snapshot: Snapshot;
}

const FREQUENCY_LABELS: Record<string, string> = {
  diaria: 'Diaria',
  semanal: 'Semanal',
  mensual: 'Mensual',
  segun_uso: 'Según el uso',
};

const CARE_LABELS: Record<string, string> = {
  trafico_moderado: 'Uso residencial y tránsito moderado',
  evitar_agua_estancada: 'Retirar de inmediato el agua estancada',
  alfombras_antihumedad: 'Usar alfombras absorbentes en los accesos',
  protectores_muebles: 'Colocar protectores en patas y apoyos',
  temperatura_estable: 'Evitar cambios bruscos de temperatura',
  no_mojar_exceso: 'Limpiar sin exceso de agua',
  evitar_puntos_calor: 'Evitar calor directo y sostenido',
  no_arrastrar_muebles: 'Levantar los muebles para desplazarlos',
  no_usar_abrasivos: 'No usar abrasivos ni herramientas filosas',
  ventilar_regularmente: 'Ventilar el ambiente con regularidad',
};

const ROUTINES: Record<Project['materialInstalado']['tipo'], Array<{ title: string; body: string }>> = {
  spc: [
    { title: 'Retirá polvo y arena', body: 'Usá mopa suave, escoba de cerdas blandas o aspiradora con accesorio para pisos.' },
    { title: 'Limpiá apenas húmedo', body: 'Pasá microfibra bien escurrida con agua y limpiador neutro. No hace falta inundar la superficie.' },
    { title: 'Secá los derrames', body: 'Aunque el SPC resiste el agua, retirala pronto para cuidar juntas, zócalos y el soporte.' },
    { title: 'Protegé el uso diario', body: 'Colocá fieltros en muebles, levantá las piezas pesadas y cuidá los accesos desde el exterior.' },
  ],
  laminado: [
    { title: 'Retirá polvo y arena', body: 'Usá mopa suave o aspiradora con accesorio para pisos, sin cepillos que rayen.' },
    { title: 'Limpiá casi en seco', body: 'Pasá microfibra apenas húmeda y muy bien escurrida con limpiador neutro.' },
    { title: 'Actuá ante derrames', body: 'Secá cualquier líquido de inmediato, especialmente sobre juntas y perímetros.' },
    { title: 'Protegé el uso diario', body: 'Usá fieltros, alfombras absorbentes en accesos y levantá los muebles para moverlos.' },
  ],
  madera: [
    { title: 'Retirá el polvo', body: 'Usá mopa suave o aspiradora con accesorio para madera.' },
    { title: 'Limpiá casi en seco', body: 'Aplicá sólo un producto específico para la terminación y microfibra muy bien escurrida.' },
    { title: 'Cuidá el ambiente', body: 'Mantené una temperatura estable y evitá humedad o sequedad extremas.' },
    { title: 'Prevení marcas', body: 'Usá fieltros, protegé zonas de alto tránsito y no arrastres muebles.' },
  ],
  deck: [
    { title: 'Retirá residuos', body: 'Barré hojas, tierra y partículas que puedan obstruir el drenaje.' },
    { title: 'Lavá con suavidad', body: 'Usá agua, jabón neutro y un cepillo de cerdas blandas.' },
    { title: 'Enjuagá y drená', body: 'Retirá el producto y verificá que las ranuras queden libres.' },
    { title: 'Revisá periódicamente', body: 'Controlá fijaciones, terminaciones y desgaste antes de intervenir.' },
  ],
  revestimiento: [
    { title: 'Retirá el polvo', body: 'Usá un paño suave o aspiración de baja potencia.' },
    { title: 'Probá primero', body: 'Aplicá el producto en una zona poco visible antes de limpiar toda la superficie.' },
    { title: 'Limpiá sin saturar', body: 'Usá poca humedad y retirala al terminar.' },
    { title: 'Evitá impactos', body: 'No apoyes herramientas filosas ni elementos que puedan rayar la terminación.' },
  ],
  otro: [
    { title: 'Retirá el polvo', body: 'Usá elementos suaves que no rayen la superficie.' },
    { title: 'Usá producto neutro', body: 'Limpiá con poca humedad y seguí siempre la indicación del fabricante.' },
    { title: 'Actuá rápido', body: 'Retirá derrames y suciedad antes de que se adhieran.' },
    { title: 'Prevení daños', body: 'Protegé apoyos, evitá impactos y no arrastres objetos pesados.' },
  ],
};

const ATTENTION_BY_TYPE: Record<Project['materialInstalado']['tipo'], string> = {
  spc: 'Resistente al agua no significa sumergible: evitá charcos prolongados, vapor y calor directo sobre el piso.',
  laminado: 'El agua y el vapor pueden dañar las juntas. Usá siempre muy poca humedad y secá de inmediato.',
  madera: 'La madera responde a la humedad y la temperatura. Ante cambios visibles, consultanos antes de intervenir.',
  deck: 'No acerques una hidrolavadora a las tablas ni uses presión alta sobre juntas y terminaciones.',
  revestimiento: 'No apliques productos agresivos sin confirmar antes su compatibilidad con la terminación.',
  otro: 'Ante una mancha difícil o una alteración de la superficie, consultanos antes de usar productos agresivos.',
};

const METHOD_BY_TYPE: Record<Project['materialInstalado']['tipo'], string> = {
  spc: 'Microfibra bien escurrida',
  laminado: 'Microfibra casi seca',
  madera: 'Producto específico y poca humedad',
  deck: 'Cepillo de cerdas suaves',
  revestimiento: 'Paño suave y poca humedad',
  otro: 'Método suave y producto neutro',
};

const KEY_RULE_BY_TYPE: Record<Project['materialInstalado']['tipo'], string> = {
  spc: 'Sin abrasivos, vapor ni charcos',
  laminado: 'Sin exceso de agua ni vapor',
  madera: 'Humedad y temperatura estables',
  deck: 'Drenaje libre y sin alta presión',
  revestimiento: 'Probar antes en un área oculta',
  otro: 'Seguir la indicación del fabricante',
};

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function sentences(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function displayCare(item: string): string {
  return CARE_LABELS[item] ?? item.replace(/_/g, ' ');
}

export function MaintenanceGuide({ project, snapshot }: Props) {
  const projectType = project.materialInstalado.tipo;
  const type = ROUTINES[projectType] ? projectType : 'otro';
  const apt = list(snapshot.productosAptos);
  const avoid = list(snapshot.productosNoAptos);
  const care = [...list(snapshot.usoRecomendado), ...list(snapshot.precauciones)]
    .filter((item, index, items) => items.indexOf(item) === index)
    .slice(0, 5);
  const recommendations = sentences(snapshot.recomendaciones);
  const frequency = FREQUENCY_LABELS[String(snapshot.frecuenciaLimpieza ?? '')] ?? 'Según el uso';

  return (
    <div className="maintenance-guide">
      <section className="maintenance-hero print-color">
        <div>
          <p className="maintenance-kicker">Guía práctica de cuidado</p>
          <h2>Conservar el piso es simple.</h2>
          <p>Una rutina suave y constante protege la terminación y prolonga su vida útil.</p>
        </div>
        <div className="maintenance-material">
          <span>Material instalado</span>
          <strong>{type.toUpperCase()}</strong>
          <small>{formatMaterialForClient(project.materialInstalado.descripcion)}</small>
        </div>
      </section>

      <div className="maintenance-highlights">
        <div><span>Rutina</span><strong>{frequency}</strong></div>
        <div><span>Método</span><strong>{METHOD_BY_TYPE[type]}</strong></div>
        <div><span>Regla clave</span><strong>{KEY_RULE_BY_TYPE[type]}</strong></div>
      </div>

      <div className="maintenance-columns">
        <section className="maintenance-routine">
          <p className="maintenance-section-label">Paso a paso</p>
          <div className="maintenance-steps">
            {ROUTINES[type].map((step, index) => (
              <div className="maintenance-step" key={step.title}>
                <span>{index + 1}</span>
                <div><strong>{step.title}</strong><p>{step.body}</p></div>
              </div>
            ))}
          </div>
        </section>

        <div className="maintenance-side">
          <section className="maintenance-card is-ok">
            <p className="maintenance-section-label">Podés usar</p>
            <ul>{apt.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
          <section className="maintenance-card is-avoid">
            <p className="maintenance-section-label">Evitá</p>
            <ul>{avoid.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        </div>
      </div>

      <div className="maintenance-bottom">
        <section>
          <p className="maintenance-section-label">Claves para conservarlo</p>
          <ul className="maintenance-care-list">
            {(care.length ? care.map(displayCare) : recommendations).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
        <aside className="maintenance-attention print-color">
          <span>Importante</span>
          <p>{ATTENTION_BY_TYPE[type]}</p>
        </aside>
      </div>

      {recommendations.length > 0 && care.length > 0 && (
        <p className="maintenance-note"><strong>Consejo COTA CERO:</strong> {recommendations[0]}</p>
      )}
    </div>
  );
}
