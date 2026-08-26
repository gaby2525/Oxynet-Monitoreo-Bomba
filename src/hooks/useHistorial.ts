import { useEffect, useMemo, useState } from 'react';
import { limitToLast, onValue, orderByKey, query, ref } from 'firebase/database';
import { obtenerDb } from '../lib/firebase';
import { DB_ROOT } from '../lib/config';
import { historialDemo, modoDemo } from '../lib/demo';
import type { Rango, Ventana } from '../lib/rangos';
import type { HistorialRaw, PuntoHistorial } from '../lib/types';

interface Resultado {
  puntos: PuntoHistorial[];
  cargando: boolean;
  error: string | null;
  /** `true` cuando se alcanzo el tope de descarga y la ventana quedo incompleta. */
  recortado: boolean;
  /** Inicio efectivo del eje temporal. */
  desdeMs: number;
}

const aNumero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Historial dentro de una ventana temporal.
 *
 * La consulta pide los ultimos `maxPuntos` por clave y el recorte a la ventana
 * se hace en el cliente. Se evito `startAt()` a proposito: las claves son el
 * epoch en segundos, que la Realtime Database indexa como enteros, y el filtro
 * por clave no se comporta igual para todos los formatos. Filtrar aca es
 * predecible y el tope de descarga es el mismo.
 */
export function useHistorial(rango: Rango, ventana: Ventana, habilitado: boolean): Resultado {
  const [crudos, setCrudos] = useState<PuntoHistorial[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tope, setTope] = useState(false);

  const { desdeMs, hastaMs } = ventana;

  useEffect(() => {
    if (modoDemo) {
      setCrudos(historialDemo(desdeMs, hastaMs, rango.maxPuntos));
      setTope(false);
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

    const consulta = query(
      ref(db, `${DB_ROOT}/historial`),
      orderByKey(),
      limitToLast(rango.maxPuntos),
    );

    // El valor de retorno de onValue es la baja de ESTA consulta. Usar `off()`
    // sobre la referencia pelada no daba de baja nada, y cada cambio de rango
    // dejaba un listener vivo pisando los datos del nuevo.
    return onValue(
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
        setCrudos(acumulado);
        setTope(acumulado.length >= rango.maxPuntos);
        setCargando(false);
        setError(null);
      },
      (err) => {
        setCargando(false);
        setError(err.message);
      },
    );
  }, [desdeMs, hastaMs, rango.maxPuntos, habilitado]);

  const puntos = useMemo(
    () => crudos.filter((p) => p.ms >= desdeMs && p.ms <= hastaMs),
    [crudos, desdeMs, hastaMs],
  );

  // Solo esta recortada si ademas de tocar el tope, lo descargado empieza
  // despues del inicio pedido: si no, el tope simplemente no molesto.
  const recortado = tope && crudos.length > 0 && crudos[0].ms > desdeMs;
  const desdeEfectivo = recortado ? crudos[0].ms : desdeMs;

  return { puntos, cargando, error, recortado, desdeMs: desdeEfectivo };
}
