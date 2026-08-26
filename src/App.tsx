import { memo, useCallback, useMemo, useState } from 'react';
import { GraficoMetrica } from './components/GraficoMetrica';
import { PanelAlarmas } from './components/PanelAlarmas';
import { PanelUmbrales } from './components/PanelUmbrales';
import { PantallaConfiguracion } from './components/PantallaConfiguracion';
import { SelectorRango } from './components/SelectorRango';
import { SelectorTema } from './components/SelectorTema';
import { SenalEstado } from './components/SenalEstado';
import { TablaRegistros } from './components/TablaRegistros';
import { TarjetaDispositivo } from './components/TarjetaDispositivo';
import { TarjetaMetrica } from './components/TarjetaMetrica';
import { TiraEstado } from './components/TiraEstado';
import { useAutenticacion } from './hooks/useAutenticacion';
import { useColores } from './hooks/useColores';
import { useEstadoDispositivo } from './hooks/useEstadoDispositivo';
import { useHistorial } from './hooks/useHistorial';
import { useReloj } from './hooks/useReloj';
import { useTema } from './hooks/useTema';
import { useUltimaMedicion } from './hooks/useUltimaMedicion';
import { useUmbrales } from './hooks/useUmbrales';
import {
  DB_ROOT,
  SEGUNDOS_PARA_DESACTUALIZADO,
  SEGUNDOS_PARA_SIN_DATOS,
  firebaseConfigurado,
} from './lib/config';
import { descargarCsv, informeCsv, nombreDeArchivo } from './lib/csv';
import { modoDemo } from './lib/demo';
import { errorDeInicializacion } from './lib/firebase';
import { fechaHora } from './lib/format';
import { METRICAS, alarmasActivas, descripcionLimite, severidadDe } from './lib/metricas';
import { RANGO_POR_DEFECTO, ventanaDe, type Rango, type Ventana } from './lib/rangos';
import { agregarSerie, estadisticas, resumenDelRango } from './lib/serie';
import type { EstadoConexion } from './lib/types';

const GraficoMemo = memo(GraficoMetrica);

type Vista = 'graficos' | 'tabla';

export function App() {
  const [tema, setTema] = useTema();
  const [rango, setRango] = useState<Rango>(RANGO_POR_DEFECTO);
  const [ventanaManual, setVentanaManual] = useState<Ventana | null>(null);
  const [vista, setVista] = useState<Vista>('graficos');
  const [panelUmbrales, setPanelUmbrales] = useState(false);

  const colores = useColores(tema);
  const { umbrales, guardarUmbrales, restablecer } = useUmbrales();

  // Tres relojes con distinta cadencia: el fino mueve los "hace N s", el grueso
  // el borde derecho de los graficos, y el de anclaje re-consulta la ventana
  // historica (una consulta nueva vuelve a descargar todo, asi que va lenta).
  const ahoraFino = useReloj(1000);
  const ahoraGrueso = useReloj(15_000);
  const epochConsulta = useReloj(300_000);

  const auth = useAutenticacion();
  const { medicion, cargando: cargandoVivo, error: errorVivo } = useUltimaMedicion(auth.listo);
  const { estado: dispositivo } = useEstadoDispositivo(auth.listo);

  // El borde derecho sigue al reloj grueso salvo en un rango elegido a mano,
  // donde la ventana es exactamente la que se pidio.
  const ventana = useMemo(
    () => ventanaDe(rango, rango.ms === null ? ahoraGrueso : epochConsulta, ventanaManual),
    [rango, ahoraGrueso, epochConsulta, ventanaManual],
  );

  const {
    puntos,
    cargando: cargandoHistorial,
    error: errorHistorial,
    recortado,
    desdeMs,
  } = useHistorial(rango, ventana, auth.listo);

  const hastaMs = useMemo(() => {
    if (rango.ms === null) return ventana.hastaMs;
    const ultimo = puntos.length > 0 ? puntos[puntos.length - 1].ms : 0;
    return Math.max(ahoraGrueso, ultimo);
  }, [rango.ms, ventana.hastaMs, ahoraGrueso, puntos]);

  const ultimoMs = medicion && medicion.timestamp > 0 ? medicion.timestamp * 1000 : null;

  const estadoConexion: EstadoConexion = useMemo(() => {
    if (errorVivo) return 'error';
    if (!auth.listo || cargandoVivo) return 'conectando';
    if (ultimoMs === null) return 'sin-datos';
    const edad = (ahoraFino - ultimoMs) / 1000;
    if (edad > SEGUNDOS_PARA_SIN_DATOS) return 'sin-datos';
    if (edad > SEGUNDOS_PARA_DESACTUALIZADO) return 'desactualizado';
    return 'en-vivo';
  }, [errorVivo, auth.listo, cargandoVivo, ultimoMs, ahoraFino]);

  const resumen = useMemo(
    () => resumenDelRango(puntos, umbrales, desdeMs, hastaMs),
    [puntos, umbrales, desdeMs, hastaMs],
  );

  const series = useMemo(
    () =>
      METRICAS.map((definicion) => ({
        definicion,
        ...agregarSerie(puntos, definicion.clave, desdeMs, hastaMs),
        stats: estadisticas(puntos, definicion.clave, umbrales),
      })),
    [puntos, desdeMs, hastaMs, umbrales],
  );

  const alarmas = useMemo(
    () => (estadoConexion === 'sin-datos' ? [] : alarmasActivas(medicion, umbrales)),
    [medicion, umbrales, estadoConexion],
  );

  const etiquetaRango =
    rango.ms === null
      ? `${fechaHora(ventana.desdeMs)} → ${fechaHora(ventana.hastaMs)}`
      : rango.etiqueta;

  const descargar = useCallback(() => {
    descargarCsv(
      informeCsv({ puntos, resumen, umbrales, etiquetaRango }),
      nombreDeArchivo(rango.ms === null ? 'personalizado' : rango.etiqueta),
    );
  }, [puntos, resumen, umbrales, etiquetaRango, rango]);

  const elegirRango = useCallback((r: Rango) => {
    setRango(r);
    if (r.ms !== null) setVentanaManual(null);
  }, []);

  if (!firebaseConfigurado && !modoDemo) {
    return (
      <div className="envoltorio">
        <PantallaConfiguracion />
      </div>
    );
  }

  const error = errorDeInicializacion ?? errorVivo ?? errorHistorial;

  return (
    <>
      <header className="barra">
        <div className="barra__interior">
          <div className="marca">
            <span className="marca__logo" aria-hidden="true">
              O
            </span>
            <div className="marca__texto">
              <h1>Oxynet · Bomba de oxigeno</h1>
              <p>
                PZEM-004T vía ESP32 en <code>{DB_ROOT}</code>
              </p>
            </div>
          </div>
          <div className="barra__acciones">
            <SenalEstado estado={estadoConexion} ultimoMs={ultimoMs} ahora={ahoraFino} />
            <SelectorTema tema={tema} onCambiar={setTema} />
          </div>
        </div>
      </header>

      <div className="envoltorio">
        {error && (
          <div className="nota nota--error" role="alert">
            <span className="nota__icono" aria-hidden="true">
              ■
            </span>
            <span>
              No se pudo leer la base: {error}. Suele ser por las reglas de seguridad de la Realtime
              Database o por una <code>databaseURL</code> equivocada.
            </span>
          </div>
        )}

        {auth.aviso && (
          <div className="nota" role="status">
            <span className="nota__icono" aria-hidden="true">
              ▲
            </span>
            <span>{auth.aviso}</span>
          </div>
        )}

        {modoDemo && (
          <div className="nota" role="status">
            <span className="nota__icono" aria-hidden="true">
              ●
            </span>
            <span>
              <b>Modo demostracion:</b> los valores son simulados, no vienen del ESP32. Quitar{' '}
              <code>?demo=1</code> de la URL para volver a los datos reales.
            </span>
          </div>
        )}

        {estadoConexion === 'sin-datos' && !error && (
          <div className="nota" role="status">
            <span className="nota__icono" aria-hidden="true">
              ▲
            </span>
            <span>
              Hace mas de {SEGUNDOS_PARA_SIN_DATOS} s que no llega una lectura nueva. Revisar que el
              ESP32 tenga energia y Wi-Fi; los graficos siguen mostrando lo ultimo registrado.
            </span>
          </div>
        )}

        <PanelAlarmas alarmas={alarmas} />

        <TiraEstado
          medicion={medicion}
          umbrales={umbrales}
          resumen={resumen}
          ahora={ahoraFino}
          etiquetaRango={etiquetaRango}
        />

        <section className="metricas" aria-label="Valores instantaneos">
          {METRICAS.map((m, i) => (
            <TarjetaMetrica
              key={m.clave}
              etiqueta={m.etiqueta}
              valor={medicion ? medicion[m.clave] : null}
              unidad={m.unidad}
              decimales={m.decimales}
              severidad={severidadDe(m.clave, medicion, umbrales)}
              acento={colores.series[i]}
              pie={descripcionLimite(umbrales, m.clave)}
            />
          ))}
        </section>

        <div className="seccion__cabecera">
          <h2>Historial</h2>
          <SelectorRango
            rango={rango}
            ventana={ventana}
            onElegirRango={elegirRango}
            onElegirVentana={setVentanaManual}
          />
          <div className="segmentado" role="group" aria-label="Forma de ver los datos">
            <button
              type="button"
              aria-pressed={vista === 'graficos'}
              onClick={() => setVista('graficos')}
            >
              Graficos
            </button>
            <button type="button" aria-pressed={vista === 'tabla'} onClick={() => setVista('tabla')}>
              Tabla
            </button>
          </div>
          <button
            type="button"
            className="boton"
            aria-expanded={panelUmbrales}
            onClick={() => setPanelUmbrales((v) => !v)}
          >
            ⚙ Umbrales
          </button>
          <button type="button" className="boton" disabled={puntos.length === 0} onClick={descargar}>
            ↓ Informe CSV ({puntos.length})
          </button>
        </div>

        {panelUmbrales && (
          <PanelUmbrales
            umbrales={umbrales}
            colores={colores.series}
            onGuardar={guardarUmbrales}
            onRestablecer={restablecer}
            onCerrar={() => setPanelUmbrales(false)}
          />
        )}

        {recortado && (
          <div className="nota" role="status">
            <span className="nota__icono" aria-hidden="true">
              ▲
            </span>
            <span>
              El rango pedido supera el tope de {rango.maxPuntos} registros por consulta, asi que se
              muestran los mas recientes. Para ver rangos largos completos conviene guardar resumenes
              por hora en la base (ver README).
            </span>
          </div>
        )}

        {vista === 'graficos' ? (
          <div className="graficos">
            {series.map(({ definicion, serie, agregado, stats }, i) => (
              <GraficoMemo
                key={definicion.clave}
                definicion={definicion}
                descripcion={descripcionLimite(umbrales, definicion.clave)}
                limite={umbrales[definicion.clave]}
                serie={serie}
                agregado={agregado}
                stats={stats}
                desdeMs={desdeMs}
                hastaMs={hastaMs}
                color={colores.series[i]}
                colorSuave={colores.seriesSuaves[i]}
                grilla={colores.grilla}
                eje={colores.eje}
                muted={colores.muted}
                critico={colores.critico}
                superficie={colores.superficie}
                cargando={cargandoHistorial}
              />
            ))}
          </div>
        ) : (
          <TablaRegistros puntos={puntos} umbrales={umbrales} />
        )}

        <div style={{ marginTop: 16 }}>
          <TarjetaDispositivo estado={dispositivo} ahora={ahoraFino} />
        </div>

        <footer className="pie">
          <span>
            El PZEM-004T mide una sola fase: la potencia trifasica que se muestra es una estimacion
            para carga equilibrada, y no detecta desbalance ni falta de fase.
          </span>
          <span>
            Los umbrales se guardan en este navegador. La energia del rango se integra a partir de la
            potencia medida, salteando los huecos de mas de un minuto.
          </span>
        </footer>
      </div>
    </>
  );
}
