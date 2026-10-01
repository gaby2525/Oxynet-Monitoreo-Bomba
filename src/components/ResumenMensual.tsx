import { useMemo } from 'react';
import { ref, set } from 'firebase/database';
import { obtenerDb } from '../lib/firebase';
import { DB_ROOT } from '../lib/config';

interface ResumenMensualProps {
  puntos: any[];
  historicoGuardado?: Record<string, any>;
  umbralMarcha?: number;
}

export function ResumenMensual({ puntos, historicoGuardado = {} }: ResumenMensualProps) {
  // 1. Agrupar y calcular resúmenes de los puntos crudos en memoria (Mes actual)
  const resumenesCalculados = useMemo(() => {
    if (!Array.isArray(puntos)) return {};

    const grupos: Record<string, any[]> = {};

    puntos.forEach((p) => {
      if (!p || !p.ms) return;
      const fecha = new Date(p.ms);
      const clave = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
      if (!grupos[clave]) grupos[clave] = [];
      grupos[clave].push(p);
    });

    const resultado: Record<string, any> = {};

    Object.keys(grupos).forEach((clave) => {
      const lecturas = grupos[clave];
      lecturas.sort((a, b) => a.ms - b.ms);

      let sumaI = 0;
      let sumaV = 0;
      let sumaP = 0;
      let puntosMarcha = 0;
      let arranques = 0;
      let tiempoMarchaMs = 0;
      let energiaWh = 0;

      for (let i = 0; i < lecturas.length; i++) {
        const actual = lecturas[i];
        const corriente = actual.corriente ?? 0;
        const tension = actual.tension ?? 0;
        const potencia = actual.potencia ?? 0;

        sumaI += corriente;
        sumaV += tension;
        sumaP += potencia;
        puntosMarcha++;

        // Detección de arranques por salto de tiempo (> 30s)
        if (i === 0 || actual.ms - lecturas[i - 1].ms > 30000) {
          arranques++;
        }

        // Acumulación de tiempo y energía
        if (i > 0) {
          const dtS = (actual.ms - lecturas[i - 1].ms) / 1000;
          if (dtS > 0 && dtS < 300) {
            tiempoMarchaMs += dtS * 1000;
            energiaWh += (potencia * dtS) / 3600;
          }
        }
      }

      const fechaEjemplo = new Date(lecturas[0].ms);
      const nombreMes = fechaEjemplo.toLocaleDateString('es-AR', {
        month: 'long',
        year: 'numeric',
      });

      resultado[clave] = {
        claveMes: clave,
        nombreMes: nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1),
        corrientePromedioMarcha: puntosMarcha > 0 ? sumaI / puntosMarcha : 0,
        tensionPromedioMarcha: puntosMarcha > 0 ? sumaV / puntosMarcha : 0,
        potenciaPromedioMarcha: puntosMarcha > 0 ? sumaP / puntosMarcha : 0,
        arranques,
        horasMarcha: tiempoMarchaMs / (1000 * 3600),
        consumoKwh: energiaWh / 1000,
      };
    });

    return resultado;
  }, [puntos]);

  // 2. Fusionar los datos calculados en vivo con los históricos guardados en Firebase
  const listaFinal = useMemo(() => {
    const claves = Array.from(
      new Set([...Object.keys(resumenesCalculados), ...Object.keys(historicoGuardado)])
    )
      .sort()
      .reverse();

    return claves.map((clave) => {
      const datosGuardados = historicoGuardado[clave];
      const datosCalculados = resumenesCalculados[clave];

      if (datosGuardados) {
        return { ...datosGuardados, esGuardado: true };
      }

      return { ...datosCalculados, esGuardado: false };
    });
  }, [resumenesCalculados, historicoGuardado]);

  // Función para guardar el resumen de un mes en Firebase
  const guardarEnFirebase = async (item: any) => {
    try {
      const database = obtenerDb();
      if (!database) {
        alert('❌ No se pudo conectar con Firebase. Verificá tu configuración.');
        return;
      }

      const dataToSave = {
        claveMes: item.claveMes,
        nombreMes: item.nombreMes,
        corrientePromedioMarcha: item.corrientePromedioMarcha,
        tensionPromedioMarcha: item.tensionPromedioMarcha,
        potenciaPromedioMarcha: item.potenciaPromedioMarcha,
        arranques: item.arranques,
        horasMarcha: item.horasMarcha,
        consumoKwh: item.consumoKwh,
      };

      // Usa DB_ROOT para respetar la ruta exacta de tu base de datos
      const ruta = `${DB_ROOT}/resumenes_mensuales/${item.claveMes}`;
      await set(ref(database, ruta), dataToSave);
      
      alert(`✅ Resumen de ${item.nombreMes} guardado exitosamente en Firebase.`);
    } catch (error: any) {
      console.error('Error al guardar en Firebase:', error);
      alert(`❌ Error al guardar: ${error?.message || 'Permiso denegado o error de red.'}`);
    }
  };

  if (listaFinal.length === 0) {
    return (
      <div style={{ marginTop: '1.5rem', marginBottom: '2rem' }} className="tarjeta">
        <h3>📊 Comparativa Mensual (Solo en Marcha)</h3>
        <p style={{ marginTop: '0.5rem', color: '#888' }}>
          Sin registros de operación para el período consultado.
        </p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '1.5rem', marginBottom: '2rem' }}>
      <h3 style={{ marginBottom: '1rem' }}>📊 Comparativa Mensual (Solo en Marcha)</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
        {listaFinal.map((m, idx) => {
          const mesAnterior = listaFinal[idx + 1];
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
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
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
                  {!m.esGuardado && (
                    <button
                      onClick={() => guardarEnFirebase(m)}
                      title="Guardar cierre de mes en Firebase"
                      style={{
                        background: '#10b981',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '2px 6px',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                      }}
                    >
                      💾 Guardar
                    </button>
                  )}
                  {m.esGuardado && (
                    <span title="Guardado en Firebase" style={{ fontSize: '0.8rem' }}>
                      🔒
                    </span>
                  )}
                </div>
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
                          color: diffI > 5 || diffI < -5 ? '#ef4444' : '#10b981',
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
                  <span className="rotulo">Potencia Prom.</span>
                  <div>
                    <b style={{ fontSize: '1.2rem' }}>
                      {m.potenciaPromedioMarcha >= 1000
                        ? `${(m.potenciaPromedioMarcha / 1000).toFixed(2)} kW`
                        : `${Math.round(m.potenciaPromedioMarcha)} W`}
                    </b>
                  </div>
                </div>

                <div>
                  <span className="rotulo">Tiempo de Uso</span>
                  <div>
                    <b>
                      {(() => {
                        const minutosTotales = Math.round(m.horasMarcha * 60);
                        if (minutosTotales < 60) return `${minutosTotales} min`;
                        const hs = Math.floor(minutosTotales / 60);
                        const mins = minutosTotales % 60;
                        return mins > 0 ? `${hs} hs ${mins} min` : `${hs} hs`;
                      })()}
                    </b>
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
