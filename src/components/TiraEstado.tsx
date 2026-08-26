import { duracion, haceCuanto, numero, porcentaje } from '../lib/format';
import { bombaEnMarcha, potenciaTrifasicaEstimada } from '../lib/metricas';
import type { ResumenRango } from '../lib/serie';
import type { Medicion } from '../lib/types';
import type { Umbrales } from '../lib/umbrales';

interface Props {
  medicion: Medicion | null;
  umbrales: Umbrales;
  resumen: ResumenRango;
  ahora: number;
  etiquetaRango: string;
}

export function TiraEstado({ medicion, umbrales, resumen, ahora, etiquetaRango }: Props) {
  const enMarcha = bombaEnMarcha(medicion, umbrales);
  const trifasica = potenciaTrifasicaEstimada(medicion);
  const ultimoMs = medicion && medicion.timestamp > 0 ? medicion.timestamp * 1000 : null;

  const dato = (rotulo: string, valor: string, unidad?: string, titulo?: string) => (
    <div className="tira__dato">
      <span className="rotulo" title={titulo}>
        {rotulo}
      </span>
      <span className="tira__valor num">
        {valor}
        {unidad && <small>{unidad}</small>}
      </span>
    </div>
  );

  return (
    <section className="tira" aria-label="Estado general">
      <div className="tira__estado">
        <span
          className={`tira__luz${enMarcha ? ' tira__luz--marcha' : ''}`}
          aria-hidden="true"
        >
          {enMarcha ? '⏻' : '○'}
        </span>
        <div>
          <h2>{medicion ? (enMarcha ? 'Bomba en marcha' : 'Bomba detenida') : 'Sin lecturas'}</h2>
          <p>
            {medicion
              ? `${numero(medicion.potencia, 0)} W en la fase medida · ${
                  ultimoMs ? haceCuanto(ultimoMs, ahora) : 'sin fecha'
                }`
              : 'Todavia no llego ninguna medicion desde el ESP32.'}
          </p>
        </div>
      </div>

      {dato('Consumo acumulado', numero(medicion?.kwh ?? null, 2), ' kWh')}
      {dato(
        'Potencia trifasica',
        numero(trifasica, 0),
        ' W',
        '3 × la potencia medida, asumiendo carga equilibrada',
      )}
      {dato('Energia · ' + etiquetaRango, numero(resumen.energiaKwh, 3), ' kWh')}
      {dato('En marcha', duracion(resumen.segundosEnMarcha))}
      {dato('Ciclo de trabajo', porcentaje(resumen.cicloDeTrabajo, 0))}
      {dato('Arranques', String(resumen.arranques))}
    </section>
  );
}
