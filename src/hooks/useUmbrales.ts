import { useCallback, useState } from 'react';
import {
  borrarGuardados,
  guardar,
  leerGuardados,
  umbralesIniciales,
  type Umbrales,
} from '../lib/umbrales';

export interface ControlUmbrales {
  umbrales: Umbrales;
  guardarUmbrales: (u: Umbrales) => void;
  restablecer: () => void;
}

/**
 * Umbrales de alarma editables desde la app. Viven en el navegador de cada uno
 * (localStorage), asi que no hace falta abrir la escritura de la base ni que
 * nadie pueda cambiarlos de afuera; a cambio son por dispositivo.
 */
export function useUmbrales(): ControlUmbrales {
  const [umbrales, setUmbrales] = useState<Umbrales>(leerGuardados);

  const guardarUmbrales = useCallback((u: Umbrales) => {
    setUmbrales(u);
    guardar(u);
  }, []);

  const restablecer = useCallback(() => {
    borrarGuardados();
    setUmbrales(umbralesIniciales());
  }, []);

  return { umbrales, guardarUmbrales, restablecer };
}
