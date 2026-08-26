import type { PuntoHistorial } from './types';

/** CSV con separador `;` y coma decimal: es lo que Excel en es-AR abre sin pelear. */
export function historialACsv(puntos: PuntoHistorial[]): string {
  const dec = (n: number, d: number) => n.toFixed(d).replace('.', ',');
  const filas = puntos.map((p) =>
    [
      new Date(p.ms).toISOString(),
      new Date(p.ms).toLocaleString('es-AR'),
      dec(p.tension, 1),
      dec(p.corriente, 2),
      dec(p.potencia, 1),
      dec(p.cosfi, 2),
    ].join(';'),
  );
  return [
    'iso8601;fecha_local;tension_V;corriente_A;potencia_W;factor_potencia',
    ...filas,
  ].join('\r\n');
}

export function descargarCsv(contenido: string, nombre: string): void {
  // El BOM le avisa a Excel que el archivo es UTF-8.
  const blob = new Blob(['﻿' + contenido], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
