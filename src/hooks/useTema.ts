import { useCallback, useEffect, useState } from 'react';

export type Tema = 'sistema' | 'claro' | 'oscuro';

const CLAVE = 'oxynet:tema';

function leerGuardado(): Tema {
  try {
    const v = localStorage.getItem(CLAVE);
    if (v === 'claro' || v === 'oscuro' || v === 'sistema') return v;
  } catch {
    // localStorage puede estar bloqueado (modo privado); el default alcanza.
  }
  return 'sistema';
}

export function useTema(): [Tema, (t: Tema) => void] {
  const [tema, setTemaEstado] = useState<Tema>(leerGuardado);

  useEffect(() => {
    const raiz = document.documentElement;
    if (tema === 'sistema') raiz.removeAttribute('data-theme');
    else raiz.setAttribute('data-theme', tema === 'oscuro' ? 'dark' : 'light');
  }, [tema]);

  const setTema = useCallback((t: Tema) => {
    setTemaEstado(t);
    try {
      localStorage.setItem(CLAVE, t);
    } catch {
      // sin persistencia, pero el cambio de la sesion actual igual aplica
    }
  }, []);

  return [tema, setTema];
}
