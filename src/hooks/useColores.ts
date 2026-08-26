import { useEffect, useState } from 'react';
import type { Tema } from './useTema';

/**
 * Recharts pinta con atributos SVG, y los atributos de presentacion no aceptan
 * `var(--x)`. Asi que los tokens se leen del CSS ya computado y se pasan como
 * hex: el CSS sigue siendo la unica fuente de verdad de la paleta.
 */
export interface ColoresGrafico {
  serie: string;
  serieSuave: string;
  grilla: string;
  eje: string;
  muted: string;
  critico: string;
  aviso: string;
  superficie: string;
}

function leer(): ColoresGrafico {
  const estilo = getComputedStyle(document.documentElement);
  const v = (nombre: string, alternativa: string) =>
    estilo.getPropertyValue(nombre).trim() || alternativa;
  return {
    serie: v('--serie-1', '#2a78d6'),
    serieSuave: v('--serie-1-suave', 'rgba(42,120,214,0.14)'),
    grilla: v('--grilla', '#e1e0d9'),
    eje: v('--eje', '#c3c2b7'),
    muted: v('--tinta-muted', '#898781'),
    critico: v('--critico', '#d03b3b'),
    aviso: v('--aviso', '#fab219'),
    superficie: v('--superficie', '#fcfcfb'),
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
