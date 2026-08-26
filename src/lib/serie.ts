import type { ClaveMetrica, PuntoHistorial } from './types';
import { umbrales } from './config';

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
  ultimo: number;
}

/** Cantidad de puntos que se dibujan como maximo en cada grafico. */
export const PUNTOS_EN_GRAFICO = 320;

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

export function estadisticas(puntos: PuntoHistorial[], clave: ClaveMetrica): Estadisticas | null {
  if (puntos.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  let suma = 0;
  for (const p of puntos) {
    const v = p[clave];
    if (v < min) min = v;
    if (v > max) max = v;
    suma += v;
  }
  return { min, max, promedio: suma / puntos.length, ultimo: puntos[puntos.length - 1][clave] };
}

/**
 * Integra la potencia en el tiempo para estimar la energia del rango [kWh].
 * Los huecos de mas de `maxHuecoS` segundos se ignoran: si el ESP32 estuvo
 * desconectado no sabemos que paso, y rellenar inventaria consumo.
 */
export function energiaEstimadaKwh(puntos: PuntoHistorial[], maxHuecoS = 60): number {
  let joules = 0;
  for (let k = 1; k < puntos.length; k++) {
    const dt = (puntos[k].ms - puntos[k - 1].ms) / 1000;
    if (dt <= 0 || dt > maxHuecoS) continue;
    joules += ((puntos[k].potencia + puntos[k - 1].potencia) / 2) * dt;
  }
  return joules / 3_600_000;
}

/** Segundos con la bomba en marcha dentro del rango, con el mismo criterio de huecos. */
export function segundosEnMarcha(puntos: PuntoHistorial[], maxHuecoS = 60): number {
  let seg = 0;
  for (let k = 1; k < puntos.length; k++) {
    const dt = (puntos[k].ms - puntos[k - 1].ms) / 1000;
    if (dt <= 0 || dt > maxHuecoS) continue;
    if (puntos[k].potencia > umbrales.potenciaApagada) seg += dt;
  }
  return seg;
}

/** Cantidad de arranques (transiciones apagado -> en marcha) dentro del rango. */
export function contarArranques(puntos: PuntoHistorial[]): number {
  let arranques = 0;
  let previaEnMarcha = puntos.length > 0 && puntos[0].potencia > umbrales.potenciaApagada;
  for (const p of puntos) {
    const enMarcha = p.potencia > umbrales.potenciaApagada;
    if (enMarcha && !previaEnMarcha) arranques += 1;
    previaEnMarcha = enMarcha;
  }
  return arranques;
}
