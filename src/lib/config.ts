/**
 * Configuracion leida de variables de entorno (`.env` en local, panel de
 * Vercel/Netlify en produccion). Todo lo que empieza con `VITE_` termina dentro
 * del bundle: no poner secretos aca. La proteccion real son las reglas de la
 * Realtime Database (ver firebase/database.rules.json).
 */

const num = (valor: string | undefined, porDefecto: number): number => {
  const n = Number(valor);
  return Number.isFinite(n) && valor !== undefined && valor !== '' ? n : porDefecto;
};

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL ?? '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
};

/** `true` si hay lo minimo indispensable para hablar con la RTDB. */
export const firebaseConfigurado =
  firebaseConfig.databaseURL.startsWith('https://') && firebaseConfig.apiKey.length > 0;

/** Nodo raiz donde escribe el ESP32, sin barra final. */
export const DB_ROOT = (import.meta.env.VITE_DB_ROOT ?? '/bomba_oxigeno').replace(/\/+$/, '');

export const umbrales = {
  tensionNominal: num(import.meta.env.VITE_TENSION_NOMINAL, 220),
  tensionMin: num(import.meta.env.VITE_TENSION_MIN, 198),
  tensionMax: num(import.meta.env.VITE_TENSION_MAX, 242),
  corrienteMax: num(import.meta.env.VITE_CORRIENTE_MAX, 12),
  cosfiMin: num(import.meta.env.VITE_COSFI_MIN, 0.7),
  potenciaApagada: num(import.meta.env.VITE_POTENCIA_APAGADA, 15),
};

/** El ESP32 publica cada 5 s; damos margen antes de marcar la senal como caida. */
export const SEGUNDOS_PARA_DESACTUALIZADO = 20;
export const SEGUNDOS_PARA_SIN_DATOS = 120;
