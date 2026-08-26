import { useEffect, useState } from 'react';
import { onValue, ref, serverTimestamp, set } from 'firebase/database';
import { obtenerDb } from '../lib/firebase';
import { DB_ROOT } from '../lib/config';
import { estadoDispositivoDemo, modoDemo } from '../lib/demo';
import type { EstadoDispositivo, EstadoDispositivoRaw } from '../lib/types';

interface Resultado {
  estado: EstadoDispositivo | null;
  error: string | null;
}

const texto = (v: unknown, alternativa = ''): string =>
  typeof v === 'string' && v.length > 0 ? v : alternativa;
const numero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Lo que el ESP32 informa sobre si mismo: red, senal, IP, tiempo encendido. */
export function useEstadoDispositivo(habilitado: boolean): Resultado {
  const [estado, setEstado] = useState<EstadoDispositivo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (modoDemo) {
      const tick = () => setEstado(estadoDispositivoDemo(Date.now()));
      tick();
      const id = window.setInterval(tick, 10_000);
      return () => window.clearInterval(id);
    }

    if (!habilitado) return;
    const db = obtenerDb();
    if (!db) return;

    return onValue(
      ref(db, `${DB_ROOT}/estado_dispositivo`),
      (snap) => {
        const raw = snap.val() as EstadoDispositivoRaw | null;
        setError(null);
        if (!raw) {
          setEstado(null);
          return;
        }
        setEstado({
          ssid: texto(raw.ssid, '—'),
          rssi: numero(raw.rssi),
          ip: texto(raw.ip, '—'),
          mac: texto(raw.mac, '—'),
          uptimeS: numero(raw.uptime_s),
          firmware: texto(raw.firmware, '—'),
          intervaloMs: numero(raw.intervalo_ms),
          ms: numero(raw.timestamp) * 1000,
          wifiAplicado: texto(raw.wifi_aplicado),
        });
      },
      (err) => setError(err.message),
    );
  }, [habilitado]);

  return { estado, error };
}

export type ResultadoEnvioWifi = { ok: true } | { ok: false; mensaje: string };

/**
 * Deja una red preparada para que el ESP32 la tome en su proxima revision.
 *
 * Las reglas de la base permiten escribir este nodo pero no leerlo: solo el UID
 * del ESP32 puede. Asi la clave del Wi-Fi no se puede recuperar desde el panel
 * ni por nadie que entre a mirar.
 */
export async function solicitarCambioDeWifi(
  ssid: string,
  clave: string,
): Promise<ResultadoEnvioWifi> {
  if (modoDemo) return { ok: false, mensaje: 'En modo demostracion no se envia nada al dispositivo.' };

  const db = obtenerDb();
  if (!db) return { ok: false, mensaje: 'Sin conexion con la base.' };

  try {
    await set(ref(db, `${DB_ROOT}/wifi_solicitado`), {
      ssid,
      clave,
      solicitado_en: serverTimestamp(),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, mensaje: err instanceof Error ? err.message : String(err) };
  }
}
