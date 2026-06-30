'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import {
  ENCUENTROS_CRITICOS,
  CONDICIONES_ESPACIO,
  LIMPIEZA_SOPORTE,
  CONDICIONES_INICIAR,
  CRITERIOS_TECNICOS,
  USO_RECOMENDADO,
  PRECAUCIONES_FM,
  type ProtocolTemplate,
} from '@/schemas';
import { getProtocolTemplate, saveProtocolTemplate } from '@/lib/repo/protocol';

interface FormShape {
  VT_encuentrosCriticos: string[];
  VT_condicionesEspacio: string[];
  EP_limpiezaSoporte: string[];
  EP_condicionesParaIniciar: string[];
  OT_criteriosTecnicos: string[];
  OT_secuenciaEjecucion: string;
  RF_checklistCalidad: string;
  FM_usoRecomendado: string[];
  FM_precauciones: string[];
  FM_frecuenciaLimpieza: string;
  FM_productosAptos: string;
  FM_productosNoAptos: string;
}

const EMPTY_FORM: FormShape = {
  VT_encuentrosCriticos: [],
  VT_condicionesEspacio: [],
  EP_limpiezaSoporte: [],
  EP_condicionesParaIniciar: [],
  OT_criteriosTecnicos: [],
  OT_secuenciaEjecucion: '',
  RF_checklistCalidad: '',
  FM_usoRecomendado: [],
  FM_precauciones: [],
  FM_frecuenciaLimpieza: '',
  FM_productosAptos: '',
  FM_productosNoAptos: '',
};

function templateToForm(t: ProtocolTemplate | null): FormShape {
  if (!t) return EMPTY_FORM;
  return {
    VT_encuentrosCriticos: t.VT?.encuentrosCriticos ?? [],
    VT_condicionesEspacio: t.VT?.condicionesEspacio ?? [],
    EP_limpiezaSoporte: t.EP?.limpiezaSoporte ?? [],
    EP_condicionesParaIniciar: t.EP?.condicionesParaIniciar ?? [],
    OT_criteriosTecnicos: t.OT?.criteriosTecnicos ?? [],
    OT_secuenciaEjecucion: (t.OT?.secuenciaEjecucion ?? []).join('\n'),
    RF_checklistCalidad: (t.RF?.checklistCalidad ?? []).join('\n'),
    FM_usoRecomendado: t.FM?.usoRecomendado ?? [],
    FM_precauciones: t.FM?.precauciones ?? [],
    FM_frecuenciaLimpieza: t.FM?.frecuenciaLimpieza ?? '',
    FM_productosAptos: (t.FM?.productosAptos ?? []).join('\n'),
    FM_productosNoAptos: (t.FM?.productosNoAptos ?? []).join('\n'),
  };
}

function formToTemplate(v: FormShape): Omit<ProtocolTemplate, 'updatedAt' | 'updatedBy'> {
  const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
  return {
    VT: {
      encuentrosCriticos: v.VT_encuentrosCriticos,
      condicionesEspacio: v.VT_condicionesEspacio,
    },
    EP: {
      limpiezaSoporte: v.EP_limpiezaSoporte,
      condicionesParaIniciar: v.EP_condicionesParaIniciar,
    },
    OT: {
      criteriosTecnicos: v.OT_criteriosTecnicos,
      secuenciaEjecucion: lines(v.OT_secuenciaEjecucion),
    },
    RF: {
      checklistCalidad: lines(v.RF_checklistCalidad),
    },
    FM: {
      usoRecomendado: v.FM_usoRecomendado,
      precauciones: v.FM_precauciones,
      frecuenciaLimpieza: v.FM_frecuenciaLimpieza as ProtocolTemplate['FM']['frecuenciaLimpieza'],
      productosAptos: lines(v.FM_productosAptos),
      productosNoAptos: lines(v.FM_productosNoAptos),
    },
  };
}

export default function ProtocolPage() {
  const { role, user, loading } = useAuth();
  const router = useRouter();
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    if (!loading && role !== 'admin') router.replace('/projects');
  }, [role, loading, router]);

  const { register, reset, getValues } = useForm<FormShape>({
    defaultValues: EMPTY_FORM,
  });

  useEffect(() => {
    if (role !== 'admin') return;
    getProtocolTemplate().then((t) => reset(templateToForm(t)));
  }, [role, reset]);

  if (loading || role !== 'admin') return null;

  async function handleSave() {
    setSaveState('saving');
    try {
      await saveProtocolTemplate(formToTemplate(getValues()), user!.uid);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2500);
    } catch {
      setSaveState('error');
    }
  }

  const inputCls =
    'w-full border rounded-md px-3 py-2.5 text-sm focus:border-[#C38A5A] focus:outline-none transition-colors bg-[#111] border-[#2A2A2A] text-[#F5F2ED]';
  const labelCls = 'block text-[10px] font-bold uppercase tracking-[0.22em] text-[#6B6155] mb-1.5';
  const checkboxGridCls = 'grid grid-cols-2 gap-y-2.5 gap-x-4';
  const checkboxLabelCls = 'flex items-center gap-2.5 text-sm capitalize';

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <p className="eyebrow mb-1">Sistema</p>
        <h1
          className="font-bold text-[#2B2D2F] leading-none tracking-tight"
          style={{ fontSize: 42, letterSpacing: '-0.01em' }}
        >
          PROTOCOLO
        </h1>
        <p className="mt-2 text-sm text-[#6B6155]">
          Valores por defecto precargados al crear un documento nuevo.
        </p>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4">

        {/* VT */}
        <section className="bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-4 py-4 space-y-4">
          <p className="eyebrow">VT · Visita Técnica</p>
          <div>
            <p className={labelCls}>Encuentros críticos</p>
            <div className={checkboxGridCls}>
              {ENCUENTROS_CRITICOS.map((v) => (
                <label key={v} className={checkboxLabelCls}>
                  <input type="checkbox" value={v} {...register('VT_encuentrosCriticos')} />
                  {v.replace(/_/g, ' ')}
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className={labelCls}>Condiciones del espacio</p>
            <div className={checkboxGridCls}>
              {CONDICIONES_ESPACIO.map((v) => (
                <label key={v} className={checkboxLabelCls}>
                  <input type="checkbox" value={v} {...register('VT_condicionesEspacio')} />
                  {v.replace(/_/g, ' ')}
                </label>
              ))}
            </div>
          </div>
        </section>

        {/* EP */}
        <section className="bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-4 py-4 space-y-4">
          <p className="eyebrow">EP · Especificación de Preparación</p>
          <div>
            <p className={labelCls}>Limpieza del soporte</p>
            <div className={checkboxGridCls}>
              {LIMPIEZA_SOPORTE.map((v) => (
                <label key={v} className={checkboxLabelCls}>
                  <input type="checkbox" value={v} {...register('EP_limpiezaSoporte')} />
                  {v.replace(/_/g, ' ')}
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className={labelCls}>Condiciones para iniciar</p>
            <div className={checkboxGridCls}>
              {CONDICIONES_INICIAR.map((v) => (
                <label key={v} className={checkboxLabelCls}>
                  <input type="checkbox" value={v} {...register('EP_condicionesParaIniciar')} />
                  {v.replace(/_/g, ' ')}
                </label>
              ))}
            </div>
          </div>
        </section>

        {/* OT */}
        <section className="bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-4 py-4 space-y-4">
          <p className="eyebrow">OT · Orden de Trabajo</p>
          <div>
            <p className={labelCls}>Criterios técnicos</p>
            <div className={checkboxGridCls}>
              {CRITERIOS_TECNICOS.map((v) => (
                <label key={v} className={checkboxLabelCls}>
                  <input type="checkbox" value={v} {...register('OT_criteriosTecnicos')} />
                  {v.replace(/_/g, ' ')}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="OT_secuenciaEjecucion" className={labelCls}>
              Secuencia de ejecución (un paso por línea)
            </label>
            <textarea
              id="OT_secuenciaEjecucion"
              rows={4}
              className={inputCls}
              {...register('OT_secuenciaEjecucion')}
            />
          </div>
        </section>

        {/* RF */}
        <section className="bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-4 py-4 space-y-4">
          <p className="eyebrow">RF · Revisión Final</p>
          <div>
            <label htmlFor="RF_checklistCalidad" className={labelCls}>
              Checklist de calidad (un ítem por línea)
            </label>
            <textarea
              id="RF_checklistCalidad"
              rows={4}
              className={inputCls}
              {...register('RF_checklistCalidad')}
            />
          </div>
        </section>

        {/* FM */}
        <section className="bg-white border border-[rgba(43,45,47,0.10)] rounded-lg px-4 py-4 space-y-4">
          <p className="eyebrow">FM · Ficha de Mantenimiento</p>
          <div>
            <p className={labelCls}>Uso recomendado</p>
            <div className={checkboxGridCls}>
              {USO_RECOMENDADO.map((v) => (
                <label key={v} className={checkboxLabelCls}>
                  <input type="checkbox" value={v} {...register('FM_usoRecomendado')} />
                  {v.replace(/_/g, ' ')}
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className={labelCls}>Precauciones</p>
            <div className={checkboxGridCls}>
              {PRECAUCIONES_FM.map((v) => (
                <label key={v} className={checkboxLabelCls}>
                  <input type="checkbox" value={v} {...register('FM_precauciones')} />
                  {v.replace(/_/g, ' ')}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="FM_frecuenciaLimpieza" className={labelCls}>Frecuencia de limpieza</label>
            <select
              id="FM_frecuenciaLimpieza"
              {...register('FM_frecuenciaLimpieza')}
              className={inputCls}
            >
              <option value="">— Sin default —</option>
              <option value="diaria">Diaria</option>
              <option value="semanal">Semanal</option>
              <option value="mensual">Mensual</option>
              <option value="segun_uso">Según uso</option>
            </select>
          </div>
          <div>
            <label htmlFor="FM_productosAptos" className={labelCls}>Productos aptos (uno por línea)</label>
            <textarea
              id="FM_productosAptos"
              rows={3}
              className={inputCls}
              {...register('FM_productosAptos')}
            />
          </div>
          <div>
            <label htmlFor="FM_productosNoAptos" className={labelCls}>Productos NO aptos (uno por línea)</label>
            <textarea
              id="FM_productosNoAptos"
              rows={3}
              className={inputCls}
              {...register('FM_productosNoAptos')}
            />
          </div>
        </section>

        <div className="flex items-center gap-4 pb-8">
          <button
            type="submit"
            disabled={saveState === 'saving'}
            className="text-white font-bold text-[11px] uppercase tracking-[0.24em] rounded-md px-6 py-3 disabled:opacity-50 transition-colors"
            style={{ background: '#C38A5A' }}
          >
            {saveState === 'saving' ? 'Guardando…' : 'Guardar protocolo'}
          </button>
          {saveState === 'saved' && (
            <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#C38A5A]">
              Guardado
            </span>
          )}
          {saveState === 'error' && (
            <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-red-500">
              Error al guardar
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
