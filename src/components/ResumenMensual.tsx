import { useMemo } from 'react';
import type { Punto } from '../lib/types';

interface ResumenMensualProps {
  puntos: Punto[];
  umbralMarcha?: number;
}

interface DatosMes {
  claveMes: string;
  nombreMes: string;
  corrientePromedioMarcha: number;
  tensionPromedioMarcha: number;
  potenciaPromedioMarcha: number;
  arranques: number;
  horasMarcha: number;
  consumoKwh: number;
}

export function ResumenMensual({ puntos, umbralMarcha = 0.5 }: ResumenMensualProps) {
  const resumenes = useMemo(() => {
    const grupos: Record<string, Punto[]> = {};

    puntos.forEach((p) => {
      const fecha = new Date(p.ms);
      const clave = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
      if (!grupos[clave]) grupos[clave] = [];
      grupos[clave].push(p);
    });

    const resultado: DatosMes[] = [];

    Object.keys(grupos)
      .sort()
      .reverse()
      .forEach((clave) => {
        const lecturas = grupos[clave];
        lecturas.sort((a, b) => a.ms - b.ms);

        let sumaI = 0;
        let sumaV = 0;
        let sumaP = 0;
        let puntosMarcha = 0;
        let arranques = 0;
        let enMarcha = false;
        let tiempoMarchaMs = 0;
        let energiaWh = 0;

        for (let i = 0; i < lecturas.length; i++) {
          const actual = lecturas[i];
          const estaEnMarcha = actual.corriente >= umbralMarcha;

          if (estaEnMarcha && !enMarcha) {
            arranques++;
            enMarcha = true;
          } else if (!estaEnMarcha) {
            enMarcha = false;
          }

          if (estaEnMarcha) {
            sumaI += actual.corriente;
            sumaV += actual.tension;
            sumaP += actual.potencia;
            puntosMarcha++;

            if (i < lecturas.length - 1) {
              const dtS = (lecturas[i + 1].ms - actual.ms) / 1000;
              if (dtS > 0 && dtS < 300) {
                tiempoMarchaMs += dtS * 1000;
                energiaWh += (actual.potencia * dtS) / 3600;
              }
            }
          }
        }

        const fechaEjemplo = new Date(lecturas[0].ms);
        const nombreMes = fechaEjemplo.toLocaleDateString('es-AR', {
          month: 'long',
          year: 'numeric',
        });

        resultado.push({
          claveMes: clave,
          nombreMes: nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1),
          corrientePromedioMarcha: puntosMarcha > 0 ? sumaI / puntosMarcha : 0,
          tensionPromedioMarcha: puntosMarcha > 0 ? sumaV / puntosMarcha : 0,
          potenciaPromedioMarcha: puntosMarcha > 0 ? sumaP / puntosMarcha : 0,
          arranques,
          horasMarcha: tiempoMarchaMs / (1000 * 3600),
          consumoKwh: energiaWh / 1000,
        });
      });

    return resultado;
  }, [puntos, umbralMarcha]);

  if (resumenes.length === 0) {
    return null;
  }

  return (
    <div style={{ marginTop: '1.5rem', marginBottom: '2rem' }}>
      <h3 style={{ marginBottom: '1rem' }}>📊 Comparativa y Tendencia Mensual (Solo en Marcha)</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
        {resumenes.map((m, idx) => {
          const mesAnterior = resumenes[idx + 1];
          const diffI =
            mesAnterior && mesAnterior.corrientePromedioMarcha > 0
              ? ((m.corrientePromedioMarcha - mesAnterior.corrientePromedioMarcha) /
                  mesAnterior.corrientePromedioMarcha) *
                100
              : null;

          return (
            <div key={m.claveMes} className="tarjeta" style={{ padding: '1.25rem', borderRadius: '8px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                  paddingBottom: '0.5rem',
                  marginBottom: '0.75rem',
                }}
              >
                <b style={{ fontSize: '1.1rem' }}>{m.nombreMes}</b>
                <span
                  style={{
                    background: '#0284c7',
                    color: '#fff',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                    fontWeight: 'bold',
                  }}
                >
                  {m.arranques} {m.arranques === 1 ? 'Arranque' : 'Arranques'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.9rem' }}>
                <div>
                  <span className="rotulo">Corriente Prom.</span>
                  <div>
                    <b style={{ fontSize: '1.2rem' }}>{m.corrientePromedioMarcha.toFixed(2)} A</b>
                    {diffI !== null && (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          marginLeft: '6px',
                          color: diffI > 3 ? '#ef4444' : '#10b981',
                        }}
                      >
                        ({diffI > 0 ? `+${diffI.toFixed(1)}%` : `${diffI.toFixed(1)}%`})
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <span className="rotulo">Tensión Prom.</span>
                  <div>
                    <b style={{ fontSize: '1.2rem' }}>{m.tensionPromedioMarcha.toFixed(1)} V</b>
                  </div>
                </div>

                <div>
                  <span className="rotulo">Horas de Uso</span>
                  <div>
                    <b>{m.horasMarcha.toFixed(1)} hs</b>
                  </div>
                </div>

                <div>
                  <span className="rotulo">Consumo</span>
                  <div>
                    <b>{m.consumoKwh.toFixed(2)} kWh</b>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
