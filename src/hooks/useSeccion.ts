import { useCallback, useEffect, useState } from 'react';

export const SECCIONES = ['monitor', 'analisis', 'configuracion'] as const;
export type Seccion = (typeof SECCIONES)[number];

const ETIQUETAS: Record<Seccion, string> = {
  monitor: 'Monitor',
  analisis: 'Analisis',
  configuracion: 'Configuracion',
};

export const etiquetaDeSeccion = (s: Seccion) => ETIQUETAS[s];

function leerHash(): Seccion {
  const h = window.location.hash.replace(/^#\/?/, '');
  return (SECCIONES as readonly string[]).includes(h) ? (h as Seccion) : 'monitor';
}

/**
 * Seccion activa guardada en el hash de la URL: asi el boton "atras" del
 * navegador funciona y se puede compartir un enlace directo a Analisis.
 */
export function useSeccion(): [Seccion, (s: Seccion) => void] {
  const [seccion, setSeccion] = useState<Seccion>(leerHash);

  useEffect(() => {
    const alCambiar = () => setSeccion(leerHash());
    window.addEventListener('hashchange', alCambiar);
    return () => window.removeEventListener('hashchange', alCambiar);
  }, []);

  const ir = useCallback((s: Seccion) => {
    window.location.hash = `#/${s}`;
    setSeccion(s);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  return [seccion, ir];
}
