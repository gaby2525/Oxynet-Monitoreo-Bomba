import { useEffect, useState } from 'react';
import { off, onValue, ref } from 'firebase/database';
import { obtenerDb } from '../lib/firebase';
import { DB_ROOT } from '../lib/config';
import { modoDemo, ultimaMedicionDemo } from '../lib/demo';
import type { Medicion, UltimaMedicionRaw } from '../lib/types';

interface Resultado {
  medicion: Medicion | null;
  cargando: boolean;
  error: string | null;
}

const aNumero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Suscripcion en vivo a `/<root>/ultima_medicion`. */
export function useUltimaMedicion(habilitado: boolean): Resultado {
  const [medicion, setMedicion] = useState<Medicion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (modoDemo) {
      const tick = () => {
        setMedicion(ultimaMedicionDemo(Date.now()));
        setCargando(false);
      };
      tick();
      const id = window.setInterval(tick, 5000);
      return () => window.clearInterval(id);
    }

    if (!habilitado) return;

    const db = obtenerDb();
    if (!db) {
      setCargando(false);
      return;
    }

    const nodo = ref(db, `${DB_ROOT}/ultima_medicion`);
    const suscripcion = onValue(
      nodo,
      (snap) => {
        const raw = snap.val() as UltimaMedicionRaw | null;
        setCargando(false);
        setError(null);
        if (!raw) {
          setMedicion(null);
          return;
        }
        setMedicion({
          // El ESP32 guarda unix en segundos; la UI trabaja en milisegundos.
          timestamp: aNumero(raw.timestamp),
          tension: aNumero(raw.tension),
          corriente: aNumero(raw.corriente),
          potencia: aNumero(raw.potencia),
          cosfi: aNumero(raw.cosfi),
          kwh: aNumero(raw.kwh),
        });
      },
      (err) => {
        setCargando(false);
        setError(err.message);
      },
    );

    return () => off(nodo, 'value', suscripcion);
  }, [habilitado]);

  return { medicion, cargando, error };
}
