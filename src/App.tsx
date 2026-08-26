import { memo, useMemo, useState } from 'react';
import { EstadoBomba } from './components/EstadoBomba';
import { GraficoMetrica } from './components/GraficoMetrica';
import { PanelAlarmas } from './components/PanelAlarmas';
import { PantallaConfiguracion } from './components/PantallaConfiguracion';
import { SelectorTema } from './components/SelectorTema';
import { SenalEstado } from './components/SenalEstado';
import { TablaRegistros } from './components/TablaRegistros';
import { TarjetaMetrica } from './components/TarjetaMetrica';
import { useAutenticacion } from './hooks/useAutenticacion';
import { useColores } from './hooks/useColores';
import { useHistorial } from './hooks/useHistorial';
import { useReloj } from './hooks/useReloj';
import { useTema } from './hooks/useTema';
import { useUltimaMedicion } from './hooks/useUltimaMedicion';
import {
  DB_ROOT,
  SEGUNDOS_PARA_DESACTUALIZADO,
  SEGUNDOS_PARA_SIN_DATOS,
  firebaseConfigurado,
  umbrales,
} from './lib/config';
import { descargarCsv, historialACsv } from './lib/csv';
import { errorDeInicializacion } from './lib/firebase';
import { modoDemo } from './lib/demo';
import { numero } from './lib/format';
import { METRICAS, alarmasActivas, severidadDe } from './lib/metricas';
import { RANGOS, RANGO_POR_DEFECTO, type Rango } from './lib/rangos';
import {
  agregarSerie,
  contarArranques,
  energiaEstimadaKwh,
  estadisticas,
  segundosEnMarcha,
} from './lib/serie';
import type { EstadoConexion } from './lib/types';

const GraficoMemo = memo(GraficoMetrica);

type Vista = 'graficos' | 'tabla';

export function App() {
  const [tema, setTema] = useTema();
  const [rango, setRango] = useState<Rango>(RANGO_POR_DEFECTO);
  const [vista, setVista] = useState<Vista>('graficos');

  const colores = useColores(tema);

  // Tres relojes con distinta cadencia: el fino mueve los "hace N s", el grueso
  // el borde derecho de los graficos, y el de anclaje re-consulta la ventana
  // historica (una consulta nueva vuelve a descargar todo, asi que va lenta).
  const ahoraFino = useReloj(1000);
  const ahoraGrueso = useReloj(15_000);
  const epochConsulta = useReloj(300_000);

  const auth = useAutenticacion();
  const { medicion, cargando: cargandoVivo, error: errorVivo } = useUltimaMedicion(auth.listo);
  const {
    puntos,
    cargando: cargandoHistorial,
    error: errorHistorial,
    recortado,
    desdeMs,
  } = useHistorial(rango, epochConsulta, auth.listo);

  const ultimoMs = medicion && medicion.timestamp > 0 ? medicion.timestamp * 1000 : null;

  const estadoConexion: EstadoConexion = useMemo(() => {
    if (errorVivo) return 'error';
    if (!auth.listo || cargandoVivo) return 'conectando';
    if (ultimoMs === null) return 'sin-datos';
    const edadSegundos = (ahoraFino - ultimoMs) / 1000;
    if (edadSegundos > SEGUNDOS_PARA_SIN_DATOS) return 'sin-datos';
    if (edadSegundos > SEGUNDOS_PARA_DESACTUALIZADO) return 'desactualizado';
    return 'en-vivo';
  }, [errorVivo, auth.listo, cargandoVivo, ultimoMs, ahoraFino]);

  const hastaMs = useMemo(() => {
    const ultimoDelHistorial = puntos.length > 0 ? puntos[puntos.length - 1].ms : 0;
    return Math.max(ahoraGrueso, ultimoDelHistorial);
  }, [ahoraGrueso, puntos]);

  const series = useMemo(
    () =>
      METRICAS.map((definicion) => ({
        definicion,
        ...agregarSerie(puntos, definicion.clave, desdeMs, hastaMs),
        stats: estadisticas(puntos, definicion.clave),
      })),
    [puntos, desdeMs, hastaMs],
  );

  const resumenRango = useMemo(
    () => ({
      energia: energiaEstimadaKwh(puntos),
      marcha: segundosEnMarcha(puntos),
      arranques: contarArranques(puntos),
    }),
    [puntos],
  );

  const alarmas = useMemo(
    () => (estadoConexion === 'sin-datos' ? [] : alarmasActivas(medicion)),
    [medicion, estadoConexion],
  );

  if (!firebaseConfigurado && !modoDemo) {
    return (
      <div className="app">
        <PantallaConfiguracion />
      </div>
    );
  }

  const error = errorDeInicializacion ?? errorVivo ?? errorHistorial;

  return (
    <div className="app">
      <header className="encabezado">
        <div className="encabezado__titulo">
          <h1>Oxynet · Monitoreo de la bomba de oxigeno</h1>
          <p>
            Lecturas del PZEM-004T publicadas por el ESP32 en <code>{DB_ROOT}</code>, cada 5 s.
          </p>
        </div>
        <div className="encabezado__acciones">
          <SenalEstado estado={estadoConexion} ultimoMs={ultimoMs} ahora={ahoraFino} />
          <SelectorTema tema={tema} onCambiar={setTema} />
        </div>
      </header>

      {error && (
        <div className="nota" role="alert">
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

      <PanelAlarmas alarmas={alarmas} />

      <EstadoBomba
        medicion={medicion}
        ahora={ahoraFino}
        segundosEnMarcha={resumenRango.marcha}
        arranques={resumenRango.arranques}
        etiquetaRango={rango.etiqueta}
      />

      <section className="grilla-metricas" aria-label="Valores instantaneos">
        {METRICAS.map((m) => (
          <TarjetaMetrica
            key={m.clave}
            etiqueta={m.etiqueta}
            valor={medicion ? medicion[m.clave] : null}
            unidad={m.unidad}
            decimales={m.decimales}
            severidad={severidadDe(m.clave, medicion)}
            pie={m.descripcion}
          />
        ))}
        <TarjetaMetrica
          etiqueta="Energia del rango"
          valor={resumenRango.energia}
          unidad="kWh"
          decimales={3}
          severidad={null}
          pie={`Integrando la potencia medida en las ultimas ${rango.etiqueta.toLowerCase()}.`}
        />
      </section>

      <div className="barra-filtros">
        <h2 className="barra-filtros__titulo">Historial</h2>

        <div className="grupo-botones" role="group" aria-label="Rango de tiempo">
          {RANGOS.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={rango.id === r.id}
              onClick={() => setRango(r)}
            >
              {r.etiqueta}
            </button>
          ))}
        </div>

        <div className="grupo-botones" role="group" aria-label="Forma de ver los datos">
          <button type="button" aria-pressed={vista === 'graficos'} onClick={() => setVista('graficos')}>
            Graficos
          </button>
          <button type="button" aria-pressed={vista === 'tabla'} onClick={() => setVista('tabla')}>
            Tabla
          </button>
        </div>

        <button
          type="button"
          className="boton"
          disabled={puntos.length === 0}
          onClick={() =>
            descargarCsv(
              historialACsv(puntos),
              `bomba-oxigeno-${rango.id}-${new Date().toISOString().slice(0, 16).replace(':', '')}.csv`,
            )
          }
        >
          ↓ Descargar CSV ({puntos.length})
        </button>
      </div>

      {recortado && (
        <div className="nota" role="status">
          <span className="nota__icono" aria-hidden="true">
            ▲
          </span>
          <span>
            El rango de {rango.etiqueta.toLowerCase()} supera el tope de {rango.maxPuntos} registros
            por consulta, asi que se muestran los mas recientes dentro de la ventana. Para ver rangos
            largos completos conviene guardar resumenes por hora en la base (ver README).
          </span>
        </div>
      )}

      {vista === 'graficos' ? (
        <div className="grilla-graficos">
          {series.map(({ definicion, serie, agregado, stats }) => (
            <GraficoMemo
              key={definicion.clave}
              definicion={definicion}
              serie={serie}
              agregado={agregado}
              stats={stats}
              desdeMs={desdeMs}
              hastaMs={hastaMs}
              colores={colores}
              cargando={cargandoHistorial}
            />
          ))}
        </div>
      ) : (
        <TablaRegistros puntos={puntos} />
      )}

      <footer className="pie">
        <span>
          Umbrales: {umbrales.tensionMin}–{umbrales.tensionMax} V · maximo{' '}
          {numero(umbrales.corrienteMax, 1)} A · cos φ ≥ {umbrales.cosfiMin}
        </span>
        <span>
          El PZEM-004T mide una sola fase: la potencia trifasica que se muestra es una estimacion
          para carga equilibrada.
        </span>
      </footer>
    </div>
  );
}
