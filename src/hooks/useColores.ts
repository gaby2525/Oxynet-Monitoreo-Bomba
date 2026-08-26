import { useEffect, useState } from 'react';
import type { Tema } from './useTema';

/**
 * Recharts pinta con atributos SVG, y los atributos de presentacion no aceptan
 * `var(--x)`. Asi que los tokens se leen del CSS ya computado y se pasan como
 * hex: el CSS sigue siendo la unica fuente de verdad de la paleta.
 */
export interface ColoresGrafico {
  series: [string, string, string, string];
  seriesSuaves: [string, string, string, string];
  grilla: string;
  eje: string;
  muted: string;
  critico: string;
  superficie: string;
}

function leer(): ColoresGrafico {
  const estilo = getComputedStyle(document.documentElement);
  const v = (nombre: string, alternativa: string) =>
    estilo.getPropertyValue(nombre).trim() || alternativa;
  return {
    series: [
      v('--serie-1', '#098356'),
      v('--serie-2', '#ac5107'),
      v('--serie-3', '#0271c2'),
      v('--serie-4', '#a0459a'),
    ],
    seriesSuaves: [
      v('--serie-1-suave', 'rgba(9,131,86,0.14)'),
      v('--serie-2-suave', 'rgba(172,81,7,0.14)'),
      v('--serie-3-suave', 'rgba(2,113,194,0.14)'),
      v('--serie-4-suave', 'rgba(160,69,154,0.14)'),
    ],
    grilla: v('--grilla', '#e6e9ec'),
    eje: v('--eje', '#ccd2d8'),
    muted: v('--tinta-3', '#78848f'),
    critico: v('--critico', '#d03b3b'),
    superficie: v('--superficie', '#ffffff'),
  };
}

export function useColores(tema: Tema): ColoresGrafico {
  const [colores, setColores] = useState<ColoresGrafico>(leer);

  useEffect(() => {
    setColores(leer());
  }, [tema]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const alCambiar = () => setColores(leer());
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, []);

  return colores;
}
