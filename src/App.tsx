import { ResumenMensual } from './components/ResumenMensual';
import { memo, useCallback, useMemo, useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { obtenerDb } from './lib/firebase';
import { GraficoMetrica } from './components/GraficoMetrica';
import { GraficoTensionCorriente } from './components/GraficoTensionCorriente';
import { NavSecciones } from './components/NavSecciones';
import { PanelAlarmas } from './components/PanelAlarmas';
import { PanelUmbrales } from './components/PanelUmbrales';
import { PantallaConfiguracion } from './components/PantallaConfiguracion';
import { ResumenPeriodo } from './components/ResumenPeriodo';
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
import { useSeccion } from './hooks/useSeccion';
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
import { fechaHora, haceCuanto } from './lib/format';
import { METRICAS, alarmasActivas, descripcionLimite, severidadDe } from './lib/metricas';
import { RANGO_POR_DEFECTO, ventanaDe, type Rango, type Ventana } from './lib/rangos';
import {
  agregarSerie,
  estadisticas,
  parametrosDelPeriodo,
  resumenDelRango,
} from './lib/serie';
import type { EstadoConexion, PuntoHistorial } from './lib/types';

const GraficoMemo = memo(GraficoMetrica);
const GraficoTensionCorrienteMemo = memo(GraficoTensionCorriente);

export function App() {
  const [seccion, irA] = useSeccion();
  const [tema, setTema] = useTema();
  const [rango, setRango] = useState<Rango>(RANGO_POR_DEFECTO);
  const [ventanaManual, setVentanaManual] = useState<Ventana | null>(null);
  const [vistaTabla, setVistaTabla] = useState(false);

  // NUEVO ESTADO: Guarda las fotos/cierres de meses pasados desde Firebase
  const [resumenesHistoricos, setResumenesHistoricos] = useState<Record<string, any>>({});

  const colores = useColores(tema);
  const { umbrales, guardarUmbrales, restablecer } = useUmbrales();

  const ahoraFino = useReloj(1000);
  const ahoraGrueso = useReloj(15_000);
  const epochConsulta = useReloj(300_000);

  const auth = useAutenticacion();
  const { medicion, cargando: cargandoVivo, error: errorVivo } = useUltimaMedicion(auth.listo);
  const { estado: dispositivo } = useEstadoDispositivo(auth.listo);

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

  // Escuchar los resúmenes guardados usando DB_ROOT
  useEffect(() => {
    if (!auth.listo) return;
    const database = obtenerDb();
    if (!database) return;

    const resumenesRef = ref(database, `${DB_ROOT}/resumenes_mensuales`);
    const unsubscribe = onValue(resumenesRef, (snapshot) => {
      if (snapshot.exists()) {
        setResumenesHistoricos(snapshot.val());
      } else {
        setResumenesHistoricos({});
      }
    });

    return () => unsubscribe();
  }, [auth.listo]);

  // Filtra 'resumenesHistoricos' para mostrar únicamente los 2 meses más recientes (mes en curso y anterior)
  const resumenesFiltrados = useMemo(() => {
    if (!resumenesHistoricos) return {};
    const clavesOrdenadas = Object.keys(resumenesHistoricos).sort();
    const ultimasClaves = clavesOrdenadas.slice(-2);
    
    const resultado: Record<string, any> = {};
    ultimasClaves.forEach((clave) => {
      resultado[clave] = resumenesHistoricos[clave];
    });
    return resultado;
  }, [resumenesHistoricos]);

  // Rango exacto que calcula los días transcurridos desde el día 1 de este mes
  const rangoMesActual = useMemo(() => {
    const ahora = new Date();
    const inicioDeMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const msTranscurridos = ahora.getTime() - inicioDeMes.getTime();
    return {
      id: 'mes-actual',
      ms: msTranscurridos,
      etiqueta: 'Mes actual',
      maxPuntos: 50000, // Cubre todo el mes de lecturas
    };
  }, [ahoraGrueso]);

  const ventanaMesActual = useMemo(
    () => ventanaDe(rangoMesActual, epochConsulta, null),
    [rangoMesActual, epochConsulta],
  );

  const { puntos: puntosMesActual } = useHistorial(rangoMesActual, ventanaMesActual, auth.listo);

  const puntosMesEnMarcha = useMemo<PuntoHistorial[]>(() => {
    if (!Array.isArray(puntosMesActual)) return [];
    return puntosMesActual.filter(
      (p) => (p?.corriente ?? 0) >= 0.5 || (p?.potencia ?? 0) > umbrales.potenciaApagada
    );
  }, [puntosMesActual, umbrales.potenciaApagada]);

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

  const parametros = useMemo(
    () => parametrosDelPeriodo(puntos, umbrales, resumen),
    [puntos, umbrales, resumen],
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

  const serieTension = useMemo(
    () => agregarSerie(puntos, 'tension', desdeMs, hastaMs).serie,
    [puntos, desdeMs, hastaMs],
  );

  const serieCorriente = useMemo(
    () => agregarSerie(puntos, 'corriente', desdeMs, hastaMs).serie,
    [puntos, desdeMs, hastaMs],
  );

  const alarmas = useMemo(
    () => (estadoConexion === 'sin-datos' ? [] : alarmasActivas(medicion, umbrales)),
    [medicion, umbrales, estadoConexion],
  );

  const sensorCaido =
    dispositivo !== null &&
    dispositivo.pzemOk === false &&
    dispositivo.ms > 0 &&
    (ahoraFino - dispositivo.ms) / 1000 < 300;

  const etiquetaRango =
    rango.ms === null
      ? `${fechaHora(ventana.desdeMs)} → ${fechaHora(ventana.hastaMs)}`
      : rango.etiqueta;

  const descargar = useCallback(() => {
    descargarCsv(
      informeCsv({ puntos, resumen, umbrales, etiquetaRango }),
      nombreDeArchivo(rango.ms === null ? 'a-medida' : rango.etiqueta),
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

  const barraRango = (
    <div className="herramientas">
      <SelectorRango
        rango={rango}
        ventana={ventana}
        onElegirRango={elegirRango}
        onElegirVentana={setVentanaManual}
      />
      {recortado && (
        <span className="herramientas__aviso">
          Mostrando los {rango.maxPuntos.toLocaleString('es-AR')} registros mas recientes: el rango
          completo no entra en una consulta.
        </span>
      )}
    </div>
  );

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
          </div>
        </div>
        <div className="barra__nav">
          <NavSecciones seccion={seccion} onIr={irA} alarmas={alarmas.length} />
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

        {modoDemo && (
          <div className="nota" role="status">
            <span className="nota__icono" aria-hidden="true">
              ●
            </span>
            <span>
              <b>Modo demostracion:</b> los valores son simulados, no vienen del ESP32.
            </span>
            <a className="boton nota__accion" href={window.location.pathname}>
              Salir del modo demo
            </a>
          </div>
        )}

        {seccion === 'monitor' && (
          <>
            {estadoConexion === 'sin-datos' && !error && !modoDemo && (
              <div className="nota" role="status">
                <span className="nota__icono" aria-hidden="true">
                  ▲
                </span>
                {sensorCaido ? (
                  <span>
