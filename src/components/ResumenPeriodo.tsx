import { duracion, numero, porcentaje } from '../lib/format';
import type { ParametrosPeriodo } from '../lib/serie';

interface Fila {
  rotulo: string;
  valor: string;
  ayuda?: string;
}

interface Grupo {
  titulo: string;
  acento?: string;
  filas: Fila[];
}

/** Cuadro de parametros del periodo, agrupado como un informe de consumo. */
export function ResumenPeriodo({
  parametros,
  colores,
  etiquetaRango,
  registros,
}: {
  parametros: ParametrosPeriodo;
  colores: string[];
  etiquetaRango: string;
  registros: number;
}) {
  const p = parametros;

  const grupos: Grupo[] = [
    {
      titulo: 'Tension',
      acento: colores[0],
      filas: [
        { rotulo: 'Media', valor: `${numero(p.tensionMedia, 1)} V` },
        { rotulo: 'Minima', valor: `${numero(p.tensionMin, 1)} V` },
        { rotulo: 'Maxima', valor: `${numero(p.tensionMax, 1)} V` },
        { rotulo: 'Desvio', valor: `${numero(p.tensionDesvio, 2)} V`, ayuda: 'Cuanto se aparta de su promedio' },
        {
          rotulo: 'Variacion',
          valor: porcentaje(p.variacionTension, 1),
          ayuda: '(maxima − minima) / media',
        },
      ],
    },
    {
      titulo: 'Corriente',
      acento: colores[1],
      filas: [
        { rotulo: 'Media', valor: `${numero(p.corrienteMedia, 2)} A`, ayuda: 'Sobre todo el periodo, incluido el tiempo detenida' },
        {
          rotulo: 'Media en marcha',
          valor: `${numero(p.corrienteMediaEnMarcha, 2)} A`,
          ayuda: 'La que se compara con la chapa del motor',
        },
        { rotulo: 'Pico', valor: `${numero(p.corrienteMax, 2)} A`, ayuda: 'Normalmente el golpe de arranque' },
      ],
    },
    {
      titulo: 'Potencia',
      acento: colores[2],
      filas: [
        { rotulo: 'Activa media', valor: `${numero(p.potenciaActivaMedia, 0)} W` },
        { rotulo: 'Activa maxima', valor: `${numero(p.potenciaActivaMaxima, 0)} W` },
        { rotulo: 'Aparente media', valor: `${numero(p.potenciaAparenteMedia, 0)} VA`, ayuda: 'S = V × I' },
        { rotulo: 'Reactiva media', valor: `${numero(p.potenciaReactivaMedia, 0)} var`, ayuda: 'La que no hace trabajo util' },
        {
          rotulo: 'Factor de carga',
          valor: porcentaje(p.factorDeCarga, 0),
          ayuda: 'Potencia media en marcha sobre la maxima: que tan parejo trabaja',
        },
        {
          rotulo: 'cos φ medio en marcha',
          valor: numero(p.factorPotenciaMedio, 2),
          ayuda: 'Promedio del factor de potencia con la bomba encendida',
        },
      ],
    },
    {
      titulo: 'Energia',
      filas: [
        { rotulo: 'Activa', valor: `${numero(p.energiaActivaKwh, 3)} kWh`, ayuda: 'La que factura la distribuidora' },
        { rotulo: 'Aparente', valor: `${numero(p.energiaAparenteKvah, 3)} kVAh` },
      ],
    },
    {
      titulo: 'Operacion',
      filas: [
        { rotulo: 'En marcha', valor: duracion(p.segundosEnMarcha) },
        { rotulo: 'Detenida', valor: duracion(p.segundosDetenida) },
        { rotulo: 'Ciclo de trabajo', valor: porcentaje(p.cicloDeTrabajo, 1) },
        { rotulo: 'Arranques', valor: String(p.arranques) },
        { rotulo: 'Arranques por hora', valor: numero(p.arranquesPorHora, 1) },
        {
          rotulo: 'Marcha media',
          valor: duracion(p.duracionMediaMarcha ?? 0),
          ayuda: 'Cuanto dura cada tramo encendido, en promedio',
        },
      ],
    },
  ];

  return (
    <section className="tarjeta resumen" aria-label="Parametros del periodo">
      <div className="resumen__cabecera">
        <h2>Parametros del periodo</h2>
        <span className="resumen__meta">
          {etiquetaRango} · {registros.toLocaleString('es-AR')} registros
        </span>
      </div>

      <div className="resumen__grilla">
        {grupos.map((g) => (
          <div
            className="resumen__grupo"
            key={g.titulo}
            style={g.acento ? ({ '--acento': g.acento } as React.CSSProperties) : undefined}
          >
            <h3 className="rotulo resumen__titulo">
              {g.acento && <span className="resumen__marca" aria-hidden="true" />}
              {g.titulo}
            </h3>
            <dl className="resumen__lista">
              {g.filas.map((f) => (
                <div className="resumen__fila" key={f.rotulo}>
                  <dt title={f.ayuda}>
                    {f.rotulo}
                    {f.ayuda && <span className="resumen__pista" aria-hidden="true">?</span>}
                  </dt>
                  <dd className="num">{f.valor}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}
