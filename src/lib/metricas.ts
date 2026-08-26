import { umbrales } from './config';
import type { Alarma, ClaveMetrica, Medicion, Severidad } from './types';

export interface DefinicionMetrica {
  clave: ClaveMetrica;
  etiqueta: string;
  unidad: string;
  decimales: number;
  descripcion: string;
  /** Banda de referencia a dibujar en el grafico, si corresponde. */
  banda?: { min?: number; max?: number };
}

export const METRICAS: DefinicionMetrica[] = [
  {
    clave: 'tension',
    etiqueta: 'Tension',
    unidad: 'V',
    decimales: 1,
    descripcion: `Rango admitido ${umbrales.tensionMin}–${umbrales.tensionMax} V (nominal ${umbrales.tensionNominal} V).`,
    banda: { min: umbrales.tensionMin, max: umbrales.tensionMax },
  },
  {
    clave: 'corriente',
    etiqueta: 'Corriente',
    unidad: 'A',
    decimales: 2,
    descripcion: `Corriente maxima admitida ${umbrales.corrienteMax} A.`,
    banda: { max: umbrales.corrienteMax },
  },
  {
    clave: 'potencia',
    etiqueta: 'Potencia activa',
    unidad: 'W',
    decimales: 0,
    descripcion: 'Potencia medida sobre la fase instrumentada.',
  },
  {
    clave: 'cosfi',
    etiqueta: 'Factor de potencia',
    unidad: '',
    decimales: 2,
    descripcion: `Se espera cos φ ≥ ${umbrales.cosfiMin} con la bomba en marcha.`,
    banda: { min: umbrales.cosfiMin },
  },
];

export function bombaEnMarcha(m: Medicion | null): boolean {
  return m !== null && m.potencia > umbrales.potenciaApagada;
}

/**
 * Severidad de una metrica puntual. Con la bomba detenida solo la tension
 * tiene sentido: corriente ~0 y cos φ ~0 son lo esperado, no una falla.
 */
export function severidadDe(clave: ClaveMetrica, m: Medicion | null): Severidad {
  if (!m) return 'neutral';
  const enMarcha = bombaEnMarcha(m);

  switch (clave) {
    case 'tension': {
      const { tensionMin, tensionMax } = umbrales;
      if (m.tension < tensionMin || m.tension > tensionMax) return 'critical';
      const margen = (tensionMax - tensionMin) * 0.1;
      if (m.tension < tensionMin + margen || m.tension > tensionMax - margen) return 'warning';
      return 'ok';
    }
    case 'corriente': {
      if (m.corriente > umbrales.corrienteMax) return 'critical';
      if (m.corriente > umbrales.corrienteMax * 0.85) return 'warning';
      return enMarcha ? 'ok' : 'neutral';
    }
    case 'cosfi': {
      if (!enMarcha) return 'neutral';
      if (m.cosfi < umbrales.cosfiMin) return 'warning';
      return 'ok';
    }
    case 'potencia':
      return enMarcha ? 'ok' : 'neutral';
  }
}

/** Alarmas activas para la ultima medicion. Lista vacia = todo en orden. */
export function alarmasActivas(m: Medicion | null): Alarma[] {
  if (!m) return [];
  const alarmas: Alarma[] = [];
  const enMarcha = bombaEnMarcha(m);
  const { tensionMin, tensionMax, corrienteMax, cosfiMin } = umbrales;

  if (m.tension < tensionMin) {
    alarmas.push({
      id: 'subtension',
      severidad: 'critical',
      titulo: 'Subtension',
      detalle: `${m.tension.toFixed(1)} V, por debajo del minimo de ${tensionMin} V. Trabajar con baja tension hace que el motor tome mas corriente y se recaliente.`,
    });
  } else if (m.tension > tensionMax) {
    alarmas.push({
      id: 'sobretension',
      severidad: 'critical',
      titulo: 'Sobretension',
      detalle: `${m.tension.toFixed(1)} V, por encima del maximo de ${tensionMax} V.`,
    });
  }

  if (m.corriente > corrienteMax) {
    alarmas.push({
      id: 'sobrecorriente',
      severidad: 'critical',
      titulo: 'Sobrecorriente',
      detalle: `${m.corriente.toFixed(2)} A, por encima del maximo de ${corrienteMax} A. Revisar bloqueo mecanico o rotor trabado.`,
    });
  } else if (m.corriente > corrienteMax * 0.85) {
    alarmas.push({
      id: 'corriente-alta',
      severidad: 'warning',
      titulo: 'Corriente elevada',
      detalle: `${m.corriente.toFixed(2)} A, sobre el 85 % del maximo (${corrienteMax} A).`,
    });
  }

  if (enMarcha && m.cosfi < cosfiMin) {
    alarmas.push({
      id: 'cosfi-bajo',
      severidad: 'warning',
      titulo: 'Factor de potencia bajo',
      detalle: `cos φ = ${m.cosfi.toFixed(2)} (minimo esperado ${cosfiMin}). Suele indicar motor muy poco cargado.`,
    });
  }

  return alarmas;
}

/**
 * Potencia trifasica estimada asumiendo carga equilibrada: el PZEM-004T mide
 * una sola fase, asi que esto es 3× lo medido, no una medicion real.
 */
export function potenciaTrifasicaEstimada(m: Medicion | null): number | null {
  if (!m) return null;
  return m.potencia * 3;
}
