import { numero } from '../lib/format';
import type { Severidad } from '../lib/types';

const ICONO: Record<Severidad, string> = { ok: '✓', warning: '▲', critical: '■', neutral: '·' };
const ETIQUETA: Record<Severidad, string> = {
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
  /** `null` en las tarjetas que son un calculo, no un estado del equipo. */
  severidad: Severidad | null;
  /** Color de serie que liga la tarjeta con su grafico. */
  acento?: string;
  pie?: string;
}

export function TarjetaMetrica({
  etiqueta,
  valor,
  unidad,
  decimales,
  severidad,
  acento,
  pie,
}: Props) {
  return (
    <article
      className="tarjeta metrica"
      style={acento ? ({ '--acento': acento } as React.CSSProperties) : undefined}
    >
      <div className="metrica__cabecera">
        <h3 className="rotulo">{etiqueta}</h3>
        {severidad && (
          <span className={`chip chip--${severidad}`}>
            <span className="chip__icono" aria-hidden="true">
              {ICONO[severidad]}
            </span>
            {ETIQUETA[severidad]}
          </span>
        )}
      </div>
      <p className="metrica__valor num">
        {numero(valor, decimales)}
        {unidad && <span className="metrica__unidad">{unidad}</span>}
      </p>
      {pie && <p className="metrica__pie">{pie}</p>}
    </article>
  );
}
