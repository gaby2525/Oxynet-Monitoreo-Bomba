import type { EstadoDispositivo, Medicion, PuntoHistorial } from './types';

/**
 * Modo demostracion (`?demo=1`): genera lecturas sinteticas para poder ver la
 * interfaz sin el ESP32 encendido — util para probar el deploy o mostrar el
 * panel antes de conectar la base.
 */
export const modoDemo =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('demo');

const CICLO_MS = 18 * 60_000; // 12 min en marcha + 6 min detenida
const MARCHA_MS = 12 * 60_000;

/** Ruido determinista por instante, para que dos llamadas al mismo t coincidan. */
function ruido(ms: number, semilla: number): number {
  const x = Math.sin(ms / 1000 + semilla * 127.1) * 43758.5453;
  return x - Math.floor(x) - 0.5;
}

function estadoEn(ms: number): { enMarcha: boolean; fraccion: number } {
  const fase = ((ms % CICLO_MS) + CICLO_MS) % CICLO_MS;
  return { enMarcha: fase < MARCHA_MS, fraccion: fase / MARCHA_MS };
}

export function medicionDemo(ms: number): PuntoHistorial {
  const { enMarcha, fraccion } = estadoEn(ms);
  const tension = 220 + Math.sin(ms / 900_000) * 6 + ruido(ms, 1) * 2.5;

  if (!enMarcha) {
    return { ms, tension, corriente: 0, potencia: 0, cosfi: 0 };
  }

  // Pico de arranque en los primeros segundos, despues regimen estable.
  const arranque = fraccion < 0.004 ? 3.6 : 1;
  const corriente = Math.max(0, (7.9 + ruido(ms, 2) * 0.45) * arranque);
  const cosfi = Math.min(0.98, 0.83 + ruido(ms, 3) * 0.05 - (arranque > 1 ? 0.25 : 0));
  return { ms, tension, corriente, potencia: tension * corriente * cosfi, cosfi };
}

export function ultimaMedicionDemo(ms: number, kwhBase = 148.2): Medicion {
  const p = medicionDemo(ms);
  return {
    timestamp: Math.floor(ms / 1000),
    tension: p.tension,
    corriente: p.corriente,
    potencia: p.potencia,
    cosfi: p.cosfi,
    kwh: kwhBase + (ms % 86_400_000) / 3_600_000 / 2,
  };
}

/** Serie historica sintetica con el mismo paso de 5 s que usa el firmware. */
export function historialDemo(desdeMs: number, hastaMs: number, maxPuntos: number): PuntoHistorial[] {
  const pasoBase = 5_000;
  const puntosTeoricos = Math.ceil((hastaMs - desdeMs) / pasoBase);
  const paso = pasoBase * Math.max(1, Math.ceil(puntosTeoricos / maxPuntos));
  const puntos: PuntoHistorial[] = [];
  for (let t = Math.ceil(desdeMs / paso) * paso; t <= hastaMs; t += paso) {
    puntos.push(medicionDemo(t));
  }
  return puntos;
}

/** Estado de dispositivo simulado, para ver la tarjeta sin el ESP32 encendido. */
export function estadoDispositivoDemo(ms: number): EstadoDispositivo {
  return {
    ssid: 'Oxynet-Taller',
    // Senal que respira un poco, para que el indicador no parezca congelado.
    rssi: Math.round(-58 + Math.sin(ms / 40_000) * 7),
    ip: '192.168.1.47',
    mac: 'A0:B7:65:2C:11:9E',
    uptimeS: Math.floor((ms % (86_400_000 * 3)) / 1000),
    firmware: 'oxynet-esp32 2.0.0 (demo)',
    intervaloMs: 5000,
    ms,
    wifiAplicado: '',
  };
}
