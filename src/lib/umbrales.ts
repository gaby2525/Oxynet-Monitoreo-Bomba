import { umbralesPorDefecto } from './config';
import type { ClaveMetrica } from './types';

/** `null` en cualquiera de los dos extremos significa "sin limite por ese lado". */
export interface LimiteMetrica {
  min: number | null;
  max: number | null;
}

export interface Umbrales {
  tension: LimiteMetrica;
  corriente: LimiteMetrica;
  potencia: LimiteMetrica;
  cosfi: LimiteMetrica;
  /** Tension nominal de referencia, solo informativa. */
  tensionNominal: number;
  /** Por debajo de esta potencia [W] se considera la bomba detenida. */
  potenciaApagada: number;
}

export const CLAVE_ALMACENAMIENTO = 'oxynet:umbrales:v1';

const numeroONull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function limiteValido(l: unknown): LimiteMetrica {
  const obj = (l ?? {}) as Record<string, unknown>;
  return { min: numeroONull(obj.min), max: numeroONull(obj.max) };
}

/**
 * Normaliza lo que venga de localStorage. Si un limite quedo invertido
 * (min > max) se descarta el par: es mas seguro no alarmar que alarmar siempre.
 */
export function sanear(bruto: unknown): Umbrales {
  const obj = (bruto ?? {}) as Record<string, unknown>;
  const porMetrica = (clave: ClaveMetrica): LimiteMetrica => {
    const l = limiteValido(obj[clave]);
    if (l.min !== null && l.max !== null && l.min > l.max) return { min: null, max: null };
    return l;
  };

  const nominal = numeroONull(obj.tensionNominal);
  const apagada = numeroONull(obj.potenciaApagada);

  return {
    tension: porMetrica('tension'),
    corriente: porMetrica('corriente'),
    potencia: porMetrica('potencia'),
    cosfi: porMetrica('cosfi'),
    tensionNominal: nominal ?? umbralesPorDefecto.tensionNominal,
    potenciaApagada: apagada ?? umbralesPorDefecto.potenciaApagada,
  };
}

/** Umbrales de fabrica: los que llegan por variables de entorno. */
export function umbralesIniciales(): Umbrales {
  const u = umbralesPorDefecto;
  return {
    tension: { min: u.tensionMin, max: u.tensionMax },
    corriente: { min: null, max: u.corrienteMax },
    potencia: { min: null, max: u.potenciaMax },
    cosfi: { min: u.cosfiMin, max: null },
    tensionNominal: u.tensionNominal,
    potenciaApagada: u.potenciaApagada,
  };
}

export function leerGuardados(): Umbrales {
  try {
    const crudo = localStorage.getItem(CLAVE_ALMACENAMIENTO);
    if (!crudo) return umbralesIniciales();
    return sanear(JSON.parse(crudo));
  } catch {
    // JSON corrupto o localStorage bloqueado: los de fabrica alcanzan.
    return umbralesIniciales();
  }
}

export function guardar(u: Umbrales): void {
  try {
    localStorage.setItem(CLAVE_ALMACENAMIENTO, JSON.stringify(u));
  } catch {
    // Sin persistencia, pero los cambios de la sesion actual igual aplican.
  }
}

export function borrarGuardados(): void {
  try {
    localStorage.removeItem(CLAVE_ALMACENAMIENTO);
  } catch {
    // nada que hacer
  }
}

/** `true` si los umbrales difieren de los de fabrica. */
export function fueronEditados(u: Umbrales): boolean {
  return JSON.stringify(u) !== JSON.stringify(umbralesIniciales());
}
