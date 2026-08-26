import { numero } from '../lib/format';
import type { Severidad } from '../lib/types';

const ICONO: Record<Severidad, string> = {
  ok: '✓',
  warning: '▲',
  critical: '■',
  neutral: '·',
};

const ETIQUETA_ESTADO: Record<Severidad, string> = {
  ok: 'Normal',
  warning: 'Atencion',
  critical: 'Fuera de rango',
  neutral: 'En reposo',
};

interface Props {
  etiqueta: string;
  valor: number | null;
  unidad: string;
  decimales: number;
  /** `null` para las tarjetas que son un dato calculado y no un estado del equipo. */
  severidad: Severidad | null;
  pie?: string;
}

export function TarjetaMetrica({ etiqueta, valor, unidad, decimales, severidad, pie }: Props) {
  return (
    <article className="tarjeta metrica">
      <div className="metrica__cabecera">
        <h3 className="metrica__etiqueta">{etiqueta}</h3>
        {severidad && (
          <span className={`chip chip--${severidad}`}>
            <span className="chip__icono" aria-hidden="true">
              {ICONO[severidad]}
            </span>
            {ETIQUETA_ESTADO[severidad]}
          </span>
        )}
      </div>
      <p className="metrica__valor">
        {numero(valor, decimales)}
        {unidad && <span className="metrica__unidad">{unidad}</span>}
      </p>
      {pie && <p className="metrica__pie">{pie}</p>}
    </article>
  );
}
