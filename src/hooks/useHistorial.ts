import { useEffect, useMemo, useState } from 'react';
import { limitToLast, off, onValue, orderByKey, query, ref, startAt } from 'firebase/database';
import { obtenerDb } from '../lib/firebase';
import { DB_ROOT } from '../lib/config';
import { historialDemo, modoDemo } from '../lib/demo';
import type { Rango } from '../lib/rangos';
import type { HistorialRaw, PuntoHistorial } from '../lib/types';

interface Resultado {
  puntos: PuntoHistorial[];
  cargando: boolean;
  error: string | null;
  /** `true` cuando se alcanzo el tope de descarga y el rango quedo recortado. */
  recortado: boolean;
  /** Inicio efectivo del eje temporal. */
  desdeMs: number;
}

const aNumero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Historial dentro de una ventana temporal. Se re-suscribe al cambiar de rango;
 * el `epoch` de re-anclaje evita que la ventana quede congelada en el pasado
 * cuando la pestana lleva horas abierta.
 */
export function useHistorial(rango: Rango, epoch: number, habilitado: boolean): Resultado {
  const [puntos, setPuntos] = useState<PuntoHistorial[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recortado, setRecortado] = useState(false);

  const desdeMs = useMemo(() => epoch - rango.ms, [epoch, rango.ms]);

  useEffect(() => {
    if (modoDemo) {
      setPuntos(historialDemo(desdeMs, desdeMs + rango.ms, rango.maxPuntos));
      setRecortado(false);
      setCargando(false);
      setError(null);
      return;
    }

    if (!habilitado) return;

    const db = obtenerDb();
    if (!db) {
      setCargando(false);
      return;
    }

    setCargando(true);

    const desdeSegundos = Math.floor(desdeMs / 1000);
    const consulta = query(
      ref(db, `${DB_ROOT}/historial`),
      orderByKey(),
      startAt(String(desdeSegundos)),
      limitToLast(rango.maxPuntos),
    );

    const suscripcion = onValue(
      consulta,
      (snap) => {
        const acumulado: PuntoHistorial[] = [];
        snap.forEach((hijo) => {
          const raw = hijo.val() as HistorialRaw | null;
          const segundos = Number(hijo.key);
          if (!raw || !Number.isFinite(segundos)) return;
          acumulado.push({
            ms: segundos * 1000,
            tension: aNumero(raw.v),
            corriente: aNumero(raw.i),
            potencia: aNumero(raw.p),
            cosfi: aNumero(raw.fp),
          });
        });
        acumulado.sort((a, b) => a.ms - b.ms);
        setPuntos(acumulado);
        setRecortado(acumulado.length >= rango.maxPuntos);
        setCargando(false);
        setError(null);
      },
      (err) => {
        setCargando(false);
        setError(err.message);
      },
    );

    return () => off(ref(db, `${DB_ROOT}/historial`), 'value', suscripcion);
  }, [desdeMs, rango.ms, rango.maxPuntos, habilitado]);

  // Con la ventana recortada el eje debe arrancar en el primer dato real, no en
  // el borde teorico del rango, o el grafico queda con medio lienzo vacio.
  const desdeEfectivo = recortado && puntos.length > 0 ? puntos[0].ms : desdeMs;

  return { puntos, cargando, error, recortado, desdeMs: desdeEfectivo };
}
