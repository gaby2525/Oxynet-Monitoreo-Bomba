export interface Rango {
  id: string;
  etiqueta: string;
  /** Ventana de tiempo en milisegundos. */
  ms: number;
  /**
   * Tope de registros a descargar. El ESP32 publica cada 5 s, asi que una
   * ventana larga puede tener decenas de miles de puntos; se recorta al ultimo
   * tramo y la UI avisa cuando la cobertura quedo incompleta.
   */
  maxPuntos: number;
}

export const RANGOS: Rango[] = [
  { id: '15m', etiqueta: '15 min', ms: 15 * 60_000, maxPuntos: 400 },
  { id: '1h', etiqueta: '1 hora', ms: 60 * 60_000, maxPuntos: 1000 },
  { id: '6h', etiqueta: '6 horas', ms: 6 * 60 * 60_000, maxPuntos: 2500 },
  { id: '24h', etiqueta: '24 horas', ms: 24 * 60 * 60_000, maxPuntos: 5000 },
  { id: '7d', etiqueta: '7 dias', ms: 7 * 24 * 60 * 60_000, maxPuntos: 8000 },
];

export const RANGO_POR_DEFECTO = RANGOS[1];

export function rangoPorId(id: string | null): Rango {
  return RANGOS.find((r) => r.id === id) ?? RANGO_POR_DEFECTO;
}
