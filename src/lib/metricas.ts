import type { Alarma, ClaveMetrica, Medicion, Severidad } from './types';
import type { LimiteMetrica, Umbrales } from './umbrales';

export interface DefinicionMetrica {
  clave: ClaveMetrica;
  etiqueta: string;
  /** Nombre corto para tarjetas y encabezados de tabla. */
  corta: string;
  unidad: string;
  decimales: number;
  /** Indice de color de serie (1..4), fijo por metrica: nunca sigue al ranking. */
  serie: 1 | 2 | 3 | 4;
  /** Paso sugerido para los campos de umbral. */
  paso: number;
}

export const METRICAS: DefinicionMetrica[] = [
  { clave: 'tension', etiqueta: 'Tension', corta: 'Tension', unidad: 'V', decimales: 1, serie: 1, paso: 1 },
  { clave: 'corriente', etiqueta: 'Corriente', corta: 'Corriente', unidad: 'A', decimales: 2, serie: 2, paso: 0.1 },
  { clave: 'potencia', etiqueta: 'Potencia activa', corta: 'Potencia', unidad: 'W', decimales: 0, serie: 3, paso: 50 },
  { clave: 'cosfi', etiqueta: 'Factor de potencia', corta: 'cos φ', unidad: '', decimales: 2, serie: 4, paso: 0.05 },
];

export const METRICA_POR_CLAVE = Object.fromEntries(
  METRICAS.map((m) => [m.clave, m]),
) as Record<ClaveMetrica, DefinicionMetrica>;

export function limiteDe(umbrales: Umbrales, clave: ClaveMetrica): LimiteMetrica {
  return umbrales[clave];
}

/** Texto que describe el rango admitido, para el pie de cada grafico. */
export function descripcionLimite(umbrales: Umbrales, clave: ClaveMetrica): string {
  const { min, max } = limiteDe(umbrales, clave);
  const m = METRICA_POR_CLAVE[clave];
  const u = m.unidad ? ` ${m.unidad}` : '';
  if (min !== null && max !== null) return `Rango admitido ${min}–${max}${u}.`;
  if (max !== null) return `Maximo admitido ${max}${u}.`;
  if (min !== null) return `Minimo esperado ${min}${u}.`;
  return 'Sin umbral configurado.';
}

export function bombaEnMarcha(m: Medicion | null, umbrales: Umbrales): boolean {
  return m !== null && m.potencia > umbrales.potenciaApagada;
}

/**
 * Severidad de una metrica puntual. Con la bomba detenida solo la tension
 * tiene sentido: corriente y cos φ en cero son lo esperado en reposo, no fallas.
 */
export function severidadDe(
  clave: ClaveMetrica,
  m: Medicion | null,
  umbrales: Umbrales,
): Severidad {
  if (!m) return 'neutral';
  const enMarcha = bombaEnMarcha(m, umbrales);
  if (clave !== 'tension' && !enMarcha) return 'neutral';

  const { min, max } = limiteDe(umbrales, clave);
  const valor = m[clave];
  if (min === null && max === null) return 'neutral';
  if (min !== null && valor < min) return 'critical';
  if (max !== null && valor > max) return 'critical';

  // Margen de aviso: 10 % del ancho de la banda, o del propio limite cuando
  // solo hay uno de los dos extremos.
  const ancho = min !== null && max !== null ? max - min : Math.abs(max ?? min ?? 0);
  const margen = ancho * 0.1;
  if (min !== null && valor < min + margen) return 'warning';
  if (max !== null && valor > max - margen) return 'warning';
  return 'ok';
}

export function alarmasActivas(m: Medicion | null, umbrales: Umbrales): Alarma[] {
  if (!m) return [];
  const alarmas: Alarma[] = [];
  const enMarcha = bombaEnMarcha(m, umbrales);
  const { tension, corriente, cosfi, potencia } = umbrales;

  if (tension.min !== null && m.tension < tension.min) {
    alarmas.push({
      id: 'subtension',
      severidad: 'critical',
      titulo: 'Subtension',
      detalle: `${m.tension.toFixed(1)} V, por debajo del minimo de ${tension.min} V. Con baja tension el motor toma mas corriente y se recalienta.`,
    });
  } else if (tension.max !== null && m.tension > tension.max) {
    alarmas.push({
      id: 'sobretension',
      severidad: 'critical',
      titulo: 'Sobretension',
      detalle: `${m.tension.toFixed(1)} V, por encima del maximo de ${tension.max} V.`,
    });
  }

  if (corriente.max !== null) {
    if (m.corriente > corriente.max) {
      alarmas.push({
        id: 'sobrecorriente',
        severidad: 'critical',
        titulo: 'Sobrecorriente',
        detalle: `${m.corriente.toFixed(2)} A, por encima del maximo de ${corriente.max} A. Revisar bloqueo mecanico o rotor trabado.`,
      });
    } else if (enMarcha && m.corriente > corriente.max * 0.85) {
      alarmas.push({
        id: 'corriente-alta',
        severidad: 'warning',
        titulo: 'Corriente elevada',
        detalle: `${m.corriente.toFixed(2)} A, sobre el 85 % del maximo (${corriente.max} A).`,
      });
    }
  }

  if (enMarcha && potencia.max !== null && m.potencia > potencia.max) {
    alarmas.push({
      id: 'sobrecarga',
      severidad: 'critical',
      titulo: 'Potencia sobre el maximo',
      detalle: `${m.potencia.toFixed(0)} W, por encima del maximo de ${potencia.max} W.`,
    });
  }

  if (enMarcha && cosfi.min !== null && m.cosfi < cosfi.min) {
    alarmas.push({
      id: 'cosfi-bajo',
      severidad: 'warning',
      titulo: 'Factor de potencia bajo',
      detalle: `cos φ = ${m.cosfi.toFixed(2)} (minimo esperado ${cosfi.min}). Suele indicar un motor muy poco cargado.`,
    });
  }

  return alarmas;
}

/**
 * Potencia trifasica estimada asumiendo carga equilibrada: el PZEM-004T mide
 * una sola fase, asi que esto es 3× lo medido, no una medicion real.
 */
export function potenciaTrifasicaEstimada(m: Medicion | null): number | null {
  return m ? m.potencia * 3 : null;
}
