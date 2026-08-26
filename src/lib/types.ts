/** Formas de los datos tal como los publica el ESP32 en la Realtime Database. */

/** Nodo `/<root>/ultima_medicion` — se sobrescribe en cada envio. */
export interface UltimaMedicionRaw {
  timestamp?: number;
  tension?: number;
  corriente?: number;
  potencia?: number;
  cosfi?: number;
  kwh?: number;
}

/** Hijo de `/<root>/historial/<timestamp>` — claves cortas para ahorrar ancho de banda. */
export interface HistorialRaw {
  v?: number;
  i?: number;
  p?: number;
  fp?: number;
}

/** Medicion normalizada que consume la interfaz. */
export interface Medicion {
  /** Unix epoch en segundos. */
  timestamp: number;
  /** Tension eficaz [V] */
  tension: number;
  /** Corriente eficaz [A] */
  corriente: number;
  /** Potencia activa [W] */
  potencia: number;
  /** Factor de potencia [0..1] */
  cosfi: number;
  /** Energia acumulada [kWh] */
  kwh: number;
}

/** Punto del historial normalizado. `ms` es el timestamp en milisegundos (lo que espera el eje). */
export interface PuntoHistorial {
  ms: number;
  tension: number;
  corriente: number;
  potencia: number;
  cosfi: number;
}

export type Severidad = 'ok' | 'warning' | 'critical' | 'neutral';

export interface Alarma {
  id: string;
  severidad: Exclude<Severidad, 'ok' | 'neutral'>;
  titulo: string;
  detalle: string;
}

export type ClaveMetrica = 'tension' | 'corriente' | 'potencia' | 'cosfi';

export type EstadoConexion = 'conectando' | 'en-vivo' | 'desactualizado' | 'sin-datos' | 'error';
