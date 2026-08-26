export interface Ventana {
  desdeMs: number;
  hastaMs: number;
}

export interface Rango {
  id: string;
  etiqueta: string;
  /** Ancho de la ventana en milisegundos. `null` para el rango personalizado. */
  ms: number | null;
  /**
   * Tope de registros a descargar. El ESP32 publica cada 5 s, asi que una
   * ventana larga puede tener decenas de miles de puntos; se recorta al ultimo
   * tramo y la UI avisa cuando la cobertura quedo incompleta.
   */
  maxPuntos: number;
}

export const RANGOS: Rango[] = [
  { id: '15m', etiqueta: '15 min', ms: 15 * 60_000, maxPuntos: 600 },
  { id: '1h', etiqueta: '1 hora', ms: 60 * 60_000, maxPuntos: 1200 },
  { id: '6h', etiqueta: '6 horas', ms: 6 * 60 * 60_000, maxPuntos: 3000 },
  { id: '24h', etiqueta: '24 horas', ms: 24 * 60 * 60_000, maxPuntos: 6000 },
  { id: '7d', etiqueta: '7 dias', ms: 7 * 24 * 60 * 60_000, maxPuntos: 9000 },
];

export const RANGO_PERSONALIZADO: Rango = {
  id: 'custom',
  etiqueta: 'Personalizado',
  ms: null,
  maxPuntos: 9000,
};

export const RANGO_POR_DEFECTO = RANGOS[1];

/** Ventana concreta de un rango, anclada a `ahora` (o a lo elegido a mano). */
export function ventanaDe(rango: Rango, ahora: number, personalizada: Ventana | null): Ventana {
  if (rango.ms === null) {
    if (personalizada) return personalizada;
    return { desdeMs: ahora - RANGO_POR_DEFECTO.ms!, hastaMs: ahora };
  }
  return { desdeMs: ahora - rango.ms, hastaMs: ahora };
}

/** Formato que aceptan los `<input type="datetime-local">`, en hora local. */
export function aValorInput(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function desdeValorInput(valor: string): number | null {
  const ms = new Date(valor).getTime();
  return Number.isFinite(ms) ? ms : null;
}
