import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { obtenerAuth } from '../lib/firebase';
import { modoDemo } from '../lib/demo';

export interface EstadoAuth {
  /** `true` cuando ya se puede intentar leer la base (con o sin sesion). */
  listo: boolean;
  /** `true` si hay una sesion anonima activa. */
  autenticado: boolean;
  /** Motivo por el que no se pudo iniciar sesion, si aplica. */
  aviso: string | null;
}

/**
 * Inicia sesion anonima para que las reglas de la base puedan exigir
 * `auth != null` en vez de dejar los datos abiertos a cualquiera.
 *
 * Si el proveedor anonimo esta deshabilitado en el proyecto, no se bloquea la
 * app: se sigue adelante sin sesion, que es lo correcto cuando las reglas
 * permiten lectura publica.
 */
export function useAutenticacion(): EstadoAuth {
  const [estado, setEstado] = useState<EstadoAuth>({
    listo: modoDemo,
    autenticado: false,
    aviso: null,
  });

  useEffect(() => {
    if (modoDemo) return;

    const auth = obtenerAuth();
    if (!auth) {
      setEstado({ listo: true, autenticado: false, aviso: null });
      return;
    }

    const quitar = onAuthStateChanged(auth, (usuario) => {
      if (usuario) setEstado({ listo: true, autenticado: true, aviso: null });
    });

    signInAnonymously(auth).catch((err: { code?: string; message?: string }) => {
      const deshabilitado =
        err.code === 'auth/operation-not-allowed' || err.code === 'auth/admin-restricted-operation';
      setEstado({
        listo: true,
        autenticado: false,
        aviso: deshabilitado
          ? 'El inicio de sesion anonimo esta deshabilitado en el proyecto de Firebase. La app va a leer sin sesion, asi que las reglas de la base tienen que permitir lectura publica.'
          : `No se pudo iniciar sesion anonima: ${err.message ?? err.code ?? 'error desconocido'}.`,
      });
    });

    return quitar;
  }, []);

  return estado;
}
