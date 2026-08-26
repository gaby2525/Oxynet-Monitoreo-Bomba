/** Formateo de numeros y fechas, siempre en es-AR. */

const locale = 'es-AR';

export function numero(valor: number | null | undefined, decimales = 1): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—';
  return valor.toLocaleString(locale, {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

export function hora(ms: number): string {
  return new Date(ms).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

export function horaConSegundos(ms: number): string {
  return new Date(ms).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function fechaHora(ms: number): string {
  return new Date(ms).toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Etiqueta de eje: incluye el dia solo cuando el rango abarca mas de 24 h. */
export function etiquetaEje(ms: number, rangoMs: number): string {
  const d = new Date(ms);
  if (rangoMs > 36 * 3600 * 1000) {
    return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
  }
  return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

/** "hace 8 s", "hace 3 min", "hace 2 h". */
export function haceCuanto(ms: number, ahora = Date.now()): string {
  const seg = Math.max(0, Math.round((ahora - ms) / 1000));
  if (seg < 60) return `hace ${seg} s`;
  const min = Math.round(seg / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

/** Duracion legible a partir de segundos: "3 h 05 min". */
export function duracion(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos <= 0) return '—';
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m > 0) return `${m} min`;
  return `${Math.round(segundos)} s`;
}

/** Porcentaje a partir de una fraccion 0..1. */
export function porcentaje(fraccion: number | null, decimales = 0): string {
  if (fraccion === null || !Number.isFinite(fraccion)) return '—';
  return `${(fraccion * 100).toLocaleString(locale, {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })} %`;
}
