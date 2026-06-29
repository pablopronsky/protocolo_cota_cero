# Feature — Módulo "Protocolo" (plantillas de valores por defecto)

> Diseño: 2026-06-29 (Opus). Fuente de verdad para que Sonnet implemente.
> Mismo estilo que `REMEDIATION.md`: batches, prompts de arranque, "reglas para cualquier sesión".

## Qué es

Hoy `/protocol` es un placeholder ("Próximamente"). Lo convertimos en el **editor de
plantillas del protocolo**: un panel **admin-only** donde se definen los valores por
defecto que se **precargan** al crear/abrir cada documento nuevo (VT, EP, OT, RF, FM).

Alcance (Opción A, versión "solo defaults"):
- Se configuran **defaults sobre las listas/campos que ya existen**. NO se agregan
  opciones nuevas a las listas cerradas (los labels de checkbox siguen hardcodeados
  en `src/schemas/index.ts`).
- El template solo **siembra** documentos **vacíos** (`status === 'vacio'`). Nunca pisa
  un doc ya empezado. Si no hay template configurado, el comportamiento es idéntico al
  actual (no-op) → rollout seguro.
- **AC queda fuera** (es acta de firma/conformidad, no tiene defaults útiles).
- **Print/legajo NO se toca**: lee datos reales del doc, no el template.

## Reglas para CUALQUIER sesión que ejecute un batch

1. **Next.js 16 tiene breaking changes.** Antes de escribir código, leé la guía relevante
   en `node_modules/next/dist/docs/`. `params` es `Promise`. No asumas APIs de memoria.
2. Tocá **solo** los archivos del batch. No refactorices fuera de alcance.
3. Al terminar: verificá (typecheck o dev server vía preview) y actualizá el bloque
   "Estado" de este archivo + la memoria `project-cotacero-remediation`.
4. No commitees salvo que Pablo lo pida.

## Orden y dependencias

- **Batch A (datos + plumbing)** → no depende de nada.
- **Batch B (editor)** y **Batch C (siembra en forms)** dependen de A. B y C son
  independientes entre sí.
- **Batch C toca los 6 forms** (en realidad 5: VT/EP/OT/RF/FM). Por la regla del proyecto,
  **nunca** correr C en paralelo con otra sesión que toque forms.

| Batch | Tema | Modelo | Depende de |
|-------|------|--------|------------|
| A | Tipos, repo, hook, helper, reglas | Sonnet | — |
| B | Página editor `/protocol` + gating de nav | Sonnet | A |
| C | Siembra del template en los 5 forms | Sonnet | A |

---

## Modelo de datos

**Un solo doc Firestore:** `config/protocolTemplate`. Una lectura, edición atómica,
admin-only. Si no existe → `null` → forms se comportan como hoy.

Tipo a agregar en `src/schemas/index.ts`:

```ts
// ── Protocolo: plantilla de valores por defecto ───────────
// Cada campo es un subconjunto de la lista cerrada correspondiente, salvo los
// de texto libre (productos, secuencia, checklist) que son string[] sembrados
// como líneas. AC no tiene defaults.
export interface ProtocolTemplate {
  VT: {
    encuentrosCriticos: string[];     // ⊆ ENCUENTROS_CRITICOS
    condicionesEspacio: string[];     // ⊆ CONDICIONES_ESPACIO
  };
  EP: {
    limpiezaSoporte: string[];        // ⊆ LIMPIEZA_SOPORTE
    condicionesParaIniciar: string[]; // ⊆ CONDICIONES_INICIAR
  };
  OT: {
    criteriosTecnicos: string[];      // ⊆ CRITERIOS_TECNICOS
    secuenciaEjecucion: string[];     // descripciones de pasos (texto libre)
  };
  RF: {
    checklistCalidad: string[];       // labels de ítems de checklist (texto libre)
  };
  FM: {
    usoRecomendado: string[];         // ⊆ USO_RECOMENDADO
    precauciones: string[];           // ⊆ PRECAUCIONES_FM
    frecuenciaLimpieza: '' | 'diaria' | 'semanal' | 'mensual' | 'segun_uso';
    productosAptos: string[];
    productosNoAptos: string[];
  };
  updatedAt: number;
  updatedBy: UID;
}
```

> Nota de esfuerzo: `OT.secuenciaEjecucion` y `RF.checklistCalidad` son los únicos
> defaults que se expanden de `string[]` → `objeto[]` al sembrar (ver helper). Son los
> más valiosos (secuencia de trabajo estándar + checklist de calidad estándar). Si hay
> que recortar por tiempo, son lo último/diferible; todo lo demás es uniforme y trivial.

---

## Batch A — Tipos, repo, hook, helper, reglas · Sonnet

### A.1 — Tipo
Agregar `ProtocolTemplate` (arriba) a `src/schemas/index.ts`.

### A.2 — Repo: `src/lib/repo/protocol.ts` (nuevo)

```ts
import { doc, getDoc, onSnapshot, setDoc, Unsubscribe } from 'firebase/firestore';
import { getFirebaseDb } from '../firebase/client';
import type { ProtocolTemplate } from '@/schemas';

const db = () => getFirebaseDb();
const ref = () => doc(db(), 'config', 'protocolTemplate');

export async function getProtocolTemplate(): Promise<ProtocolTemplate | null> {
  const snap = await getDoc(ref());
  return snap.exists() ? (snap.data() as ProtocolTemplate) : null;
}

export function subscribeProtocolTemplate(
  cb: (t: ProtocolTemplate | null) => void,
): Unsubscribe {
  return onSnapshot(ref(), (snap) => cb(snap.exists() ? (snap.data() as ProtocolTemplate) : null));
}

export async function saveProtocolTemplate(
  data: Omit<ProtocolTemplate, 'updatedAt' | 'updatedBy'>,
  uid: string,
): Promise<void> {
  await setDoc(ref(), { ...data, updatedAt: Date.now(), updatedBy: uid }, { merge: true });
}
```

### A.3 — Hook: `src/hooks/useProtocolTemplate.ts` (nuevo)

```ts
'use client';
import { useEffect, useState } from 'react';
import { subscribeProtocolTemplate } from '@/lib/repo/protocol';
import type { ProtocolTemplate } from '@/schemas';

export function useProtocolTemplate() {
  const [template, setTemplate] = useState<ProtocolTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unsub = subscribeProtocolTemplate((t) => { setTemplate(t); setLoading(false); });
    return unsub;
  }, []);
  return { template, loading };
}
```

### A.4 — Helper de siembra: `src/lib/protocolDefaults.ts` (nuevo)

Punto único que traduce el template a los campos de cada form. Las dos expansiones
`string[] → objeto[]` (OT/RF) viven solo acá.

```ts
import type { ProtocolTemplate, DocType } from '@/schemas';

// Campos que el template siembra para un docType, listos para mezclar en los
// defaultValues de RHF. Devuelve {} si no hay template (→ comportamiento actual).
export function templateSeedFor(
  docType: DocType,
  template: ProtocolTemplate | null,
): Record<string, unknown> {
  if (!template) return {};
  switch (docType) {
    case 'VT':
      return {
        encuentrosCriticos: template.VT?.encuentrosCriticos ?? [],
        condicionesEspacio: template.VT?.condicionesEspacio ?? [],
      };
    case 'EP':
      return {
        limpiezaSoporte: template.EP?.limpiezaSoporte ?? [],
        condicionesParaIniciar: template.EP?.condicionesParaIniciar ?? [],
      };
    case 'OT':
      return {
        criteriosTecnicos: template.OT?.criteriosTecnicos ?? [],
        secuenciaEjecucion: (template.OT?.secuenciaEjecucion ?? []).map((descripcion, i) => ({
          paso: i + 1, descripcion, completado: false,
        })),
      };
    case 'RF':
      return {
        checklistCalidad: (template.RF?.checklistCalidad ?? []).map((item) => ({
          item, estado: '',
        })),
      };
    case 'FM':
      return {
        usoRecomendado: template.FM?.usoRecomendado ?? [],
        precauciones: template.FM?.precauciones ?? [],
        frecuenciaLimpieza: template.FM?.frecuenciaLimpieza ?? '',
        productosAptos: template.FM?.productosAptos ?? [],
        productosNoAptos: template.FM?.productosNoAptos ?? [],
      };
    default:
      return {};
  }
}
```

### A.5 — Reglas Firestore (`firestore.rules`)

Agregar dentro de `match /databases/{db}/documents { ... }` (junto a los otros `match`):

```
match /config/{doc} {
  allow read:  if signedIn();   // los forms lo leen para sembrar
  allow write: if isAdmin();    // solo admin edita el protocolo
}
```

### A.6 — (Recomendado) Validación al guardar
En `src/schemas/inputs.ts`, un zod `ProtocolTemplateInput` que valide que cada array de
checkbox sea **subconjunto** de su lista cerrada (`z.enum(...).array()`) y `frecuenciaLimpieza`
en su enum. Evita que un typo del admin envenene todos los docs futuros. Usarlo en el
handler de guardado del editor (Batch B). Si se difiere, dejarlo anotado.

**Aceptación A:** typecheck OK. `getProtocolTemplate()` y `saveProtocolTemplate()` compilan.
Reglas con emulador (si está): admin escribe `config/protocolTemplate`, técnico lo lee
pero no escribe.

**Prompt de arranque A:**
```
Leé PROTOCOL.md, sección "Batch A". Creá tipos, repo (lib/repo/protocol.ts), hook
(useProtocolTemplate), helper (lib/protocolDefaults.ts) y reglas config/. Respetá las
"Reglas para cualquier sesión". typecheck. No commitees.
```

---

## Batch C — Siembra del template en los forms · Sonnet · (DEPENDE de A)

**Toca 5 forms** (`VTForm, EPForm, OTForm, RFForm, FMForm`). **No** corre en paralelo con
otra sesión de forms. **ACForm no se toca.**

### Patrón uniforme (aplicar a cada form)

1. Subir el objeto de defaults vacíos a una const a nivel módulo `EMPTY_XX` (VT ya tiene
   `EMPTY_VT`; OT/RF/FM tienen el objeto inline en `defaultValues` → extraerlo; EP usa
   `withSeed(...)`, no necesita const nueva).
2. Importar el hook y el helper:
   ```ts
   import { useProtocolTemplate } from '@/hooks/useProtocolTemplate';
   import { templateSeedFor } from '@/lib/protocolDefaults';
   import { useRef } from 'react';
   ```
3. En el cuerpo del componente:
   ```ts
   const { template, loading: tplLoading } = useProtocolTemplate();
   const seededRef = useRef(false);
   ```
4. **Reemplazar** el `useEffect` de seed actual (`if (seedDoc) reset(...)`) por:
   ```ts
   useEffect(() => {
     if (!seedDoc || seededRef.current) return;
     const isEmpty = (seedDoc.status ?? 'vacio') === 'vacio';
     if (isEmpty && tplLoading) return; // doc vacío: esperá el template antes de sembrar
     reset({
       ...EMPTY_XX,                                    // empties del form
       ...(isEmpty ? templateSeedFor('XX', template) : {}),
       ...seedDoc,                                     // el doc vacío no trae los arrays → gana el template
     });
     seededRef.current = true;
   }, [seedDoc?.updatedAt, template, tplLoading]); // eslint-disable-line
   ```

**Por qué es seguro:**
- `seedDoc` es el snapshot estable de la página (`docData`, no cambia con autosave) →
  el efecto corre como mucho 2 veces (cuando llega `seedDoc` y cuando llega `template`),
  y `seededRef` garantiza una sola siembra.
- El template solo se mezcla si `isEmpty`. Un doc empezado (`en_progreso/completo/firmado`)
  nunca recibe defaults.
- El doc vacío (de `initEmptyDocs`) trae solo campos base → al hacer `...seedDoc` al final,
  los arrays del template **sobreviven** (no están en seedDoc).
- `reset()` dispara `watch` con `type !== 'change'` → el autosave gateado (#6) **no** se
  dispara. Los defaults quedan **locales** hasta que el usuario toque algo. (Si bloquea sin
  tocar nada, `handleLock` lee `getValues()` y **sí** persiste los defaults — deseado.)

### Especifico por form

- **VT** (`VTForm.tsx`): `EMPTY_VT` ya existe. `templateSeedFor('VT', template)`.
  Reemplazar el efecto de la línea ~80.
- **EP** (`EPForm.tsx`): usa `withSeed`. Para vacío, envolver:
  ```ts
  reset(withSeed(isEmpty ? { ...templateSeedFor('EP', template), ...seedDoc } : seedDoc));
  ```
  (`withSeed` ya aporta los empties de EP; el template gana porque `...seedDoc` vacío no
  trae `limpiezaSoporte`/`condicionesParaIniciar`.) No usar `EMPTY_XX` en EP.
- **OT** (`OTForm.tsx`): extraer el objeto inline de `defaultValues` (líneas ~32-36) a
  `EMPTY_OT`. `templateSeedFor('OT', template)` (incluye `criteriosTecnicos` +
  `secuenciaEjecucion` expandida).
- **RF** (`RFForm.tsx`): extraer a `EMPTY_RF`. `templateSeedFor('RF', template)`
  (`checklistCalidad` expandida).
- **FM** (`FMForm.tsx`): extraer a `EMPTY_FM`. `templateSeedFor('FM', template)`.

> OT `secuenciaEjecucion` y RF `checklistCalidad` usan `useFieldArray`. Sembrarlos vía
> `reset(...)` rehidrata el fieldArray correctamente (es el mecanismo estándar). Verificar
> en runtime que los pasos/ítems aparecen y son editables/eliminables.

**Aceptación C (runtime, dev server):**
- Configurar un template (Batch B) → crear/abrir un doc **nuevo** de cada tipo →
  aparecen los defaults (checkboxes marcados, FM frecuencia/productos, OT pasos, RF ítems).
- Abrir un doc **ya empezado** → muestra SUS datos, no el template.
- Abrir un doc vacío y **no** editar → no se persiste nada; sigue `vacio`.
- Editar → guarda normal. Sin template configurado → comportamiento idéntico al actual.

**Prompt de arranque C:**
```
Leé PROTOCOL.md, sección "Batch C". Confirmá que Batch A está hecho (templateSeedFor +
useProtocolTemplate existen). Aplicá el patrón de siembra a VTForm, EPForm, OTForm, RFForm,
FMForm (ACForm NO). Respetá las "Reglas para cualquier sesión". Verificá en runtime con el
dev server. No commitees.
```

---

## Batch B — Página editor `/protocol` + gating de nav · Sonnet · (DEPENDE de A)

### B.1 — Reescribir `src/app/(app)/protocol/page.tsx`

Reemplaza el placeholder. Patrón admin-only **igual a `settings/page.tsx`**:
- `const { role, user, loading } = useAuth();`
- `useEffect(() => { if (!loading && role !== 'admin') router.replace('/projects'); }, [...])`
- `if (loading || role !== 'admin') return null;`

Carga: `getProtocolTemplate()` (o el hook) → `reset(...)` en un RHF único cuyo shape
**aplana** el `ProtocolTemplate` (más simple para RHF), p. ej.:
```ts
interface FormShape {
  VT_encuentrosCriticos: string[]; VT_condicionesEspacio: string[];
  EP_limpiezaSoporte: string[];    EP_condicionesParaIniciar: string[];
  OT_criteriosTecnicos: string[];  OT_secuenciaEjecucion: string;   // textarea, una línea por paso
  RF_checklistCalidad: string;     // textarea, una línea por ítem
  FM_usoRecomendado: string[];     FM_precauciones: string[];
  FM_frecuenciaLimpieza: string;
  FM_productosAptos: string;       FM_productosNoAptos: string;      // textarea, líneas
}
```
Al guardar, re-anidar a `ProtocolTemplate` y partir los textarea con
`v.split('\n').map(s=>s.trim()).filter(Boolean)`.

UI: secciones por doc (VT / EP / OT / RF / FM), reutilizando los **mismos controles y
clases** que los forms:
- Checkbox groups: `LISTA.map(x => <label><input type="checkbox" value={x} {...register('VT_encuentrosCriticos')} />{x.replace(/_/g,' ')}</label>)`.
  Importar las constantes desde `@/schemas` (`ENCUENTROS_CRITICOS`, `CONDICIONES_ESPACIO`,
  `LIMPIEZA_SOPORTE`, `CONDICIONES_INICIAR`, `CRITERIOS_TECNICOS`, `USO_RECOMENDADO`,
  `PRECAUCIONES_FM`).
- FM frecuencia: el mismo `<select>` que `FMForm`.
- Textareas de líneas (OT secuencia, RF checklist, FM productos): mismo patrón
  `splitLines/join('\n')` que `FMForm` usa para `productosAptos`.
- Botón **"Guardar protocolo"** explícito (no autosave) → `saveProtocolTemplate(reanidado, user.uid)`
  + un `SaveIndicator`/estado "Guardado" simple. Validar con el zod de A.6 si se hizo.

Header al estilo de la página actual (`eyebrow` "Sistema" + `<h1>PROTOCOLO`).

### B.2 — Gating de nav (`src/app/(app)/layout.tsx`)

El item "Protocolo" hoy se muestra a todos. Como ahora es config admin-only,
**mostrarlo solo a admin**. En el `<nav>` (línea ~120), envolver el primer `NavItem`:
```tsx
{role === 'admin' && (
  <NavItem href="/protocol" label="Protocolo" icon={<IconPrincipio />} active={pathname.startsWith('/protocol')} />
)}
```
(`role` ya viene de `useAuth()` en el layout.)

**Aceptación B:**
- Admin ve "Protocolo" en el nav; técnico no. Técnico que entra a `/protocol` directo es
  redirigido a `/projects`.
- Editar valores + "Guardar protocolo" → persiste en `config/protocolTemplate` (verificable
  recargando la página: los valores vuelven).

**Prompt de arranque B:**
```
Leé PROTOCOL.md, sección "Batch B". Confirmá que Batch A está hecho. Reescribí
src/app/(app)/protocol/page.tsx como editor admin-only del template y gateá el nav item
"Protocolo" a admin en layout.tsx. Respetá las "Reglas para cualquier sesión". Verificá con
el dev server. No commitees.
```

---

## Archivos

**Nuevos:** `src/lib/repo/protocol.ts`, `src/hooks/useProtocolTemplate.ts`,
`src/lib/protocolDefaults.ts`.
**Editados:** `src/schemas/index.ts` (+ `inputs.ts` si A.6), `firestore.rules`,
`src/app/(app)/protocol/page.tsx` (reescritura), `src/app/(app)/layout.tsx`,
`src/components/docs/{VT,EP,OT,RF,FM}Form.tsx`.
**No tocar:** `ACForm.tsx`, print/legajo, `initEmptyDocs` (la siembra es client-side al abrir).

## Estado

- [x] Batch A — tipos / repo / hook / helper / reglas
- [x] Batch B — página editor + gating de nav
- [x] Batch C — siembra en los 5 forms
