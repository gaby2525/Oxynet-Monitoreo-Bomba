import { METRICAS } from './metricas';
import { estadisticas, type ResumenRango } from './serie';
import type { PuntoHistorial } from './types';
import type { Umbrales } from './umbrales';

/**
 * Informe CSV con tres bloques: cabecera del periodo, resumen por variable y
 * detalle registro a registro. Separador `;` y coma decimal, que es lo que
 * abre Excel en español sin pedir nada.
 */

const SEP = ';';
const dec = (n: number | null, d: number) =>
  n === null || !Number.isFinite(n) ? '' : n.toFixed(d).replace('.', ',');

const fecha = (ms: number) => new Date(ms).toLocaleString('es-AR');

function duracionHoras(segundos: number): string {
  return dec(segundos / 3600, 2);
}

export interface DatosInforme {
  puntos: PuntoHistorial[];
  resumen: ResumenRango;
  umbrales: Umbrales;
  etiquetaRango: string;
}

export function informeCsv({ puntos, resumen, umbrales, etiquetaRango }: DatosInforme): string {
  const filas: string[] = [];
  const linea = (...campos: (string | number)[]) => filas.push(campos.join(SEP));

  // --- Bloque 1: periodo -----------------------------------------------------
  linea('OXYNET - MONITOREO DE LA BOMBA DE OXIGENO');
  linea('Generado', fecha(Date.now()));
  linea('Rango', etiquetaRango);
  linea('Desde', fecha(resumen.desdeMs));
  linea('Hasta', fecha(resumen.hastaMs));
  linea('Registros', resumen.registros);
  linea('Energia estimada [kWh]', dec(resumen.energiaKwh, 4));
  linea('Tiempo con datos [h]', duracionHoras(resumen.segundosConDatos));
  linea('Tiempo en marcha [h]', duracionHoras(resumen.segundosEnMarcha));
  linea('Ciclo de trabajo [%]', dec(resumen.cicloDeTrabajo * 100, 1));
  linea('Arranques', resumen.arranques);
  linea('Potencia media en marcha [W]', dec(resumen.potenciaMediaEnMarcha, 1));
  linea('Umbral de bomba detenida [W]', dec(umbrales.potenciaApagada, 0));
  linea('');

  // --- Bloque 2: resumen por variable ---------------------------------------
  linea('RESUMEN POR VARIABLE');
  linea(
    'Variable', 'Unidad', 'Minimo', 'Momento del minimo', 'Promedio',
    'Promedio en marcha', 'Maximo', 'Momento del maximo', 'Desvio', 'Ultimo',
    'Limite minimo', 'Limite maximo',
  );
  for (const m of METRICAS) {
    const s = estadisticas(puntos, m.clave, umbrales);
    const lim = umbrales[m.clave];
    if (!s) {
      linea(m.etiqueta, m.unidad, '', '', '', '', '', '', '', '', dec(lim.min, 2), dec(lim.max, 2));
      continue;
    }
    linea(
      m.etiqueta,
      m.unidad,
      dec(s.min, m.decimales),
      fecha(s.msMin),
      dec(s.promedio, m.decimales),
      dec(s.promedioEnMarcha, m.decimales),
      dec(s.max, m.decimales),
      fecha(s.msMax),
      dec(s.desvio, m.decimales),
      dec(s.ultimo, m.decimales),
      dec(lim.min, 2),
      dec(lim.max, 2),
    );
  }
  linea('');

  // --- Bloque 3: detalle -----------------------------------------------------
  linea('DETALLE');
  linea(
    'Fecha y hora', 'ISO 8601', 'Epoch [s]', 'Tension [V]', 'Corriente [A]',
    'Potencia activa [W]', 'Factor de potencia', 'Potencia aparente [VA]',
    'Potencia reactiva [var]', 'Estado',
  );
  for (const p of puntos) {
    // S = V·I; Q se deduce del triangulo de potencias con la P medida.
    const aparente = p.tension * p.corriente;
    const reactiva = Math.sqrt(Math.max(0, aparente * aparente - p.potencia * p.potencia));
    linea(
      fecha(p.ms),
      new Date(p.ms).toISOString(),
      Math.round(p.ms / 1000),
      dec(p.tension, 1),
      dec(p.corriente, 2),
      dec(p.potencia, 1),
      dec(p.cosfi, 2),
      dec(aparente, 1),
      dec(reactiva, 1),
      p.potencia > umbrales.potenciaApagada ? 'En marcha' : 'Detenida',
    );
  }

  return filas.join('\r\n');
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

export function nombreDeArchivo(etiquetaRango: string): string {
  const marca = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const rango = etiquetaRango.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `oxynet-bomba-${rango}-${marca}.csv`;
}
