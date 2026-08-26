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
