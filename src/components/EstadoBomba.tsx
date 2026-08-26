import { duracion, haceCuanto, numero } from '../lib/format';
import { bombaEnMarcha, potenciaTrifasicaEstimada } from '../lib/metricas';
import type { Medicion } from '../lib/types';

interface Props {
  medicion: Medicion | null;
  ahora: number;
  /** Segundos en marcha dentro del rango seleccionado. */
  segundosEnMarcha: number;
  arranques: number;
  etiquetaRango: string;
}

export function EstadoBomba({ medicion, ahora, segundosEnMarcha, arranques, etiquetaRango }: Props) {
  const enMarcha = bombaEnMarcha(medicion);
  const trifasica = potenciaTrifasicaEstimada(medicion);
  const ultimoMs = medicion && medicion.timestamp > 0 ? medicion.timestamp * 1000 : null;

  return (
    <section className="tarjeta estado-bomba">
      <div className="estado-bomba__principal">
        <span
          className={`estado-bomba__indicador${enMarcha ? ' estado-bomba__indicador--marcha' : ''}`}
          aria-hidden="true"
        >
          {enMarcha ? '⏻' : '○'}
        </span>
        <div className="estado-bomba__texto">
          <h2>{medicion ? (enMarcha ? 'Bomba en marcha' : 'Bomba detenida') : 'Sin lecturas'}</h2>
          <p>
            {medicion
              ? `${numero(medicion.potencia, 0)} W sobre la fase medida · ultima lectura ${
                  ultimoMs ? haceCuanto(ultimoMs, ahora) : 'sin fecha'
                }`
              : 'Todavia no llego ninguna medicion desde el ESP32.'}
          </p>
        </div>
      </div>

      <dl style={{ display: 'contents' }}>
        <div className="estado-bomba__dato">
          <dt>Consumo acumulado</dt>
          <dd>{numero(medicion?.kwh ?? null, 2)} kWh</dd>
        </div>
        <div className="estado-bomba__dato">
          <dt title="3 × la potencia medida, asumiendo carga equilibrada">Potencia trifasica est.</dt>
          <dd>{numero(trifasica, 0)} W</dd>
        </div>
        <div className="estado-bomba__dato">
          <dt>En marcha ({etiquetaRango})</dt>
          <dd>{duracion(segundosEnMarcha)}</dd>
        </div>
        <div className="estado-bomba__dato">
          <dt>Arranques ({etiquetaRango})</dt>
          <dd>{arranques}</dd>
        </div>
      </dl>
    </section>
  );
}
