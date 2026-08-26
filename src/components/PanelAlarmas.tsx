import type { Alarma } from '../lib/types';

const ICONO = { critical: '■', warning: '▲' } as const;

export function PanelAlarmas({ alarmas }: { alarmas: Alarma[] }) {
  if (alarmas.length === 0) return null;

  return (
    <section className="alarmas" aria-label="Alarmas activas" aria-live="polite">
      {alarmas.map((a) => (
        <div key={a.id} className={`alarma alarma--${a.severidad}`}>
          <span className="alarma__icono" aria-hidden="true">
            {ICONO[a.severidad]}
          </span>
          <div>
            <div className="alarma__titulo">
              {a.severidad === 'critical' ? 'Critico' : 'Advertencia'} · {a.titulo}
            </div>
            <div className="alarma__detalle">{a.detalle}</div>
          </div>
        </div>
      ))}
    </section>
  );
}
