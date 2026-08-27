import type { ClaveMetrica, PuntoHistorial } from './types';
import type { Umbrales } from './umbrales';

/** Punto listo para el grafico: valor promedio del bucket + envolvente min/max. */
export interface PuntoSerie {
  ms: number;
  valor: number;
  /** `[min, max]` del bucket. Solo se dibuja cuando el bucket agrupa >1 muestra. */
  rango: [number, number];
  muestras: number;
}

export interface Estadisticas {
  min: number;
  max: number;
  promedio: number;
  /** Promedio contando solo las muestras con la bomba en marcha. */
  promedioEnMarcha: number | null;
  /** Desvio estandar poblacional, util para ver que tan estable esta la linea. */
  desvio: number;
  ultimo: number;
  /** Instantes en que se dieron el minimo y el maximo. */
  msMin: number;
  msMax: number;
}

export interface ResumenRango {
  registros: number;
  desdeMs: number;
  hastaMs: number;
  energiaKwh: number;
  segundosEnMarcha: number;
  segundosConDatos: number;
  arranques: number;
  /** Fraccion del tiempo con datos en que la bomba estuvo en marcha [0..1]. */
  cicloDeTrabajo: number;
  /** Potencia media mientras estuvo en marcha [W]. */
  potenciaMediaEnMarcha: number | null;
}

/** Cantidad de puntos que se dibujan como maximo en cada grafico. */
export const PUNTOS_EN_GRAFICO = 320;

/** Huecos mayores a esto se consideran "el ESP32 estuvo caido", y no se integran. */
const MAX_HUECO_S = 60;

/**
 * Reduce la serie a como maximo `objetivo` buckets de ancho temporal fijo.
 * Devuelve promedio y envolvente por bucket, para no esconder los picos que
 * justamente interesan en un motor (arranques, golpes de corriente).
 */
export function agregarSerie(
  puntos: PuntoHistorial[],
  clave: ClaveMetrica,
  desdeMs: number,
  hastaMs: number,
  objetivo = PUNTOS_EN_GRAFICO,
): { serie: PuntoSerie[]; agregado: boolean } {
  if (puntos.length === 0) return { serie: [], agregado: false };
  if (puntos.length <= objetivo) {
    return {
      serie: puntos.map((p) => ({
        ms: p.ms,
        valor: p[clave],
        rango: [p[clave], p[clave]] as [number, number],
        muestras: 1,
      })),
      agregado: false,
    };
  }

  const ancho = Math.max(1, (hastaMs - desdeMs) / objetivo);
  const buckets = new Map<number, { suma: number; min: number; max: number; n: number }>();

  for (const p of puntos) {
    const idx = Math.floor((p.ms - desdeMs) / ancho);
    const valor = p[clave];
    const b = buckets.get(idx);
    if (b) {
      b.suma += valor;
      b.n += 1;
      if (valor < b.min) b.min = valor;
      if (valor > b.max) b.max = valor;
    } else {
      buckets.set(idx, { suma: valor, min: valor, max: valor, n: 1 });
    }
  }

  const serie = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([idx, b]) => ({
      ms: Math.round(desdeMs + (idx + 0.5) * ancho),
      valor: b.suma / b.n,
      rango: [b.min, b.max] as [number, number],
      muestras: b.n,
    }));

  return { serie, agregado: true };
}

export function estadisticas(
  puntos: PuntoHistorial[],
  clave: ClaveMetrica,
  umbrales: Umbrales,
): Estadisticas | null {
  if (puntos.length === 0) return null;

  let min = Infinity;
  let max = -Infinity;
  let msMin = puntos[0].ms;
  let msMax = puntos[0].ms;
  let suma = 0;
  let sumaCuadrados = 0;
  let sumaMarcha = 0;
  let nMarcha = 0;

  for (const p of puntos) {
    const v = p[clave];
    if (v < min) { min = v; msMin = p.ms; }
    if (v > max) { max = v; msMax = p.ms; }
    suma += v;
    sumaCuadrados += v * v;
    if (p.potencia > umbrales.potenciaApagada) {
      sumaMarcha += v;
      nMarcha += 1;
    }
  }

  const n = puntos.length;
  const promedio = suma / n;
  const varianza = Math.max(0, sumaCuadrados / n - promedio * promedio);

  return {
    min,
    max,
    promedio,
    // Promediar la corriente incluyendo el tiempo detenido da un numero que no
    // significa nada; el promedio en marcha es el que se compara con la chapa.
    promedioEnMarcha: nMarcha > 0 ? sumaMarcha / nMarcha : null,
    desvio: Math.sqrt(varianza),
    ultimo: puntos[n - 1][clave],
    msMin,
    msMax,
  };
}

/**
 * Integra la potencia en el tiempo y recorre las transiciones de estado en una
 * sola pasada. Los huecos de mas de `MAX_HUECO_S` se ignoran: si el ESP32
 * estuvo desconectado no sabemos que paso, y rellenar inventaria consumo.
 */
export function resumenDelRango(
  puntos: PuntoHistorial[],
  umbrales: Umbrales,
  desdeMs: number,
  hastaMs: number,
): ResumenRango {
  let joules = 0;
  let segMarcha = 0;
  let segDatos = 0;
  let arranques = 0;
  let previaEnMarcha = puntos.length > 0 && puntos[0].potencia > umbrales.potenciaApagada;

  for (let k = 1; k < puntos.length; k++) {
    const dt = (puntos[k].ms - puntos[k - 1].ms) / 1000;
    const enMarcha = puntos[k].potencia > umbrales.potenciaApagada;
    if (enMarcha && !previaEnMarcha) arranques += 1;
    previaEnMarcha = enMarcha;

    if (dt <= 0 || dt > MAX_HUECO_S) continue;
    segDatos += dt;
    joules += ((puntos[k].potencia + puntos[k - 1].potencia) / 2) * dt;
    if (enMarcha) segMarcha += dt;
  }

  const energiaKwh = joules / 3_600_000;
  return {
    registros: puntos.length,
    desdeMs,
    hastaMs,
    energiaKwh,
    segundosEnMarcha: segMarcha,
    segundosConDatos: segDatos,
    arranques,
    cicloDeTrabajo: segDatos > 0 ? segMarcha / segDatos : 0,
    potenciaMediaEnMarcha: segMarcha > 0 ? (joules / segMarcha) : null,
  };
}

/**
 * Cuadro completo del periodo: lo que uno miraria en un informe de consumo.
 * Todo sale de una sola pasada sobre la serie ya filtrada a la ventana.
 */
export interface ParametrosPeriodo {
  // --- Tension ---
  tensionMedia: number | null;
  tensionMin: number | null;
  tensionMax: number | null;
  tensionDesvio: number | null;
  /** (max - min) / media, en fraccion. Cuanto se mueve la linea. */
  variacionTension: number | null;

  // --- Corriente ---
  corrienteMedia: number | null;
  /** Promedio contando solo el tiempo en marcha: el que se compara con la chapa. */
  corrienteMediaEnMarcha: number | null;
  corrienteMax: number | null;

  // --- Potencia ---
  potenciaActivaMedia: number | null;
  potenciaActivaMaxima: number | null;
  potenciaAparenteMedia: number | null;
  potenciaReactivaMedia: number | null;
  factorPotenciaMedio: number | null;
  /** Potencia media en marcha sobre la maxima: que tan parejo trabaja el motor. */
  factorDeCarga: number | null;

  // --- Energia ---
  energiaActivaKwh: number;
  energiaAparenteKvah: number;

  // --- Operacion ---
  segundosEnMarcha: number;
  segundosDetenida: number;
  cicloDeTrabajo: number;
  arranques: number;
  arranquesPorHora: number | null;
  /** Duracion media de cada tramo en marcha, en segundos. */
  duracionMediaMarcha: number | null;
}

export function parametrosDelPeriodo(
  puntos: PuntoHistorial[],
  umbrales: Umbrales,
  resumen: ResumenRango,
): ParametrosPeriodo {
  const vacio: ParametrosPeriodo = {
    tensionMedia: null, tensionMin: null, tensionMax: null, tensionDesvio: null,
    variacionTension: null, corrienteMedia: null, corrienteMediaEnMarcha: null,
    corrienteMax: null, potenciaActivaMedia: null, potenciaActivaMaxima: null,
    potenciaAparenteMedia: null, potenciaReactivaMedia: null, factorPotenciaMedio: null,
    factorDeCarga: null, energiaActivaKwh: 0, energiaAparenteKvah: 0,
    segundosEnMarcha: 0, segundosDetenida: 0, cicloDeTrabajo: 0, arranques: 0,
    arranquesPorHora: null, duracionMediaMarcha: null,
  };
  if (puntos.length === 0) return vacio;

  const v = estadisticas(puntos, 'tension', umbrales)!;
  const i = estadisticas(puntos, 'corriente', umbrales)!;
  const p = estadisticas(puntos, 'potencia', umbrales)!;
  const fp = estadisticas(puntos, 'cosfi', umbrales)!;

  // Potencias aparente y reactiva: se integran en el tiempo igual que la activa,
  // salteando los mismos huecos, para que kVAh y kWh sean comparables.
  let vaSegundos = 0;
  let varSegundos = 0;
  let pMaxEnMarcha = 0;
  for (let k = 1; k < puntos.length; k++) {
    const dt = (puntos[k].ms - puntos[k - 1].ms) / 1000;
    if (dt <= 0 || dt > MAX_HUECO_S) continue;
    const s1 = puntos[k - 1].tension * puntos[k - 1].corriente;
    const s2 = puntos[k].tension * puntos[k].corriente;
    const q1 = Math.sqrt(Math.max(0, s1 * s1 - puntos[k - 1].potencia ** 2));
    const q2 = Math.sqrt(Math.max(0, s2 * s2 - puntos[k].potencia ** 2));
    vaSegundos += ((s1 + s2) / 2) * dt;
    varSegundos += ((q1 + q2) / 2) * dt;
    if (puntos[k].potencia > pMaxEnMarcha) pMaxEnMarcha = puntos[k].potencia;
  }

  const conDatos = resumen.segundosConDatos;
  const horas = conDatos / 3600;

  return {
    tensionMedia: v.promedio,
    tensionMin: v.min,
    tensionMax: v.max,
    tensionDesvio: v.desvio,
    variacionTension: v.promedio > 0 ? (v.max - v.min) / v.promedio : null,

    corrienteMedia: i.promedio,
    corrienteMediaEnMarcha: i.promedioEnMarcha,
    corrienteMax: i.max,

    potenciaActivaMedia: p.promedio,
    potenciaActivaMaxima: p.max,
    potenciaAparenteMedia: conDatos > 0 ? vaSegundos / conDatos : null,
    potenciaReactivaMedia: conDatos > 0 ? varSegundos / conDatos : null,
    factorPotenciaMedio: fp.promedioEnMarcha,
    factorDeCarga:
      pMaxEnMarcha > 0 && resumen.potenciaMediaEnMarcha !== null
        ? resumen.potenciaMediaEnMarcha / pMaxEnMarcha
        : null,

    energiaActivaKwh: resumen.energiaKwh,
    energiaAparenteKvah: vaSegundos / 3_600_000,

    segundosEnMarcha: resumen.segundosEnMarcha,
    segundosDetenida: Math.max(0, conDatos - resumen.segundosEnMarcha),
    cicloDeTrabajo: resumen.cicloDeTrabajo,
    arranques: resumen.arranques,
    arranquesPorHora: horas > 0.05 ? resumen.arranques / horas : null,
    duracionMediaMarcha:
      resumen.arranques > 0 ? resumen.segundosEnMarcha / resumen.arranques : null,
  };
}
