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

/**
 * Limpia un valor pegado a mano en el panel de Vercel/Netlify: espacios y
 * saltos de linea al final, y las comillas que se arrastran cuando se copia
 * `apiKey: "AIza..."` en vez de solo el valor.
 */
const env = (valor: string | undefined): string => {
  const limpio = (valor ?? '').trim();
  return limpio.replace(/^['"]|['"]$/g, '').trim();
};

export const firebaseConfig = {
  apiKey: env(import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: env(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  databaseURL: env(import.meta.env.VITE_FIREBASE_DATABASE_URL).replace(/\/+$/, ''),
  projectId: env(import.meta.env.VITE_FIREBASE_PROJECT_ID),
  storageBucket: env(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: env(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: env(import.meta.env.VITE_FIREBASE_APP_ID),
};

export interface RevisionVariable {
  nombre: string;
  /** Valor tal como quedo en el bundle, ya limpiado. */
  valor: string;
  requerida: boolean;
  /** Que esta mal, o `null` si esta bien. */
  problema: string | null;
  /**
   * `true` si el problema impide inicializar Firebase. Los que no bloquean se
   * muestran igual, pero dejan arrancar la app.
   */
  bloquea: boolean;
}

/** `true` cuando la URL apunta a la raiz de una base, sin path ni query. */
function urlDeBaseValida(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.pathname === '' || u.pathname === '/') && u.search === '';
  } catch {
    return false;
  }
}

/**
 * Revision de las variables de entorno para la pantalla de configuracion.
 * Se evalua sobre los valores que quedaron horneados en el build: si una
 * variable figura vacia aca, no llego al momento de compilar, por mas que este
 * cargada en el panel de la plataforma.
 */
export function revisarConfiguracion(): RevisionVariable[] {
  const { apiKey, authDomain, databaseURL, projectId, appId } = firebaseConfig;

  const opcional = (nombre: string, valor: string): RevisionVariable => ({
    nombre,
    valor,
    requerida: false,
    problema: valor === '' ? 'Sin cargar.' : null,
    bloquea: false,
  });

  const revisarApiKey = (): RevisionVariable => {
    if (apiKey === '') {
      return { nombre: 'VITE_FIREBASE_API_KEY', valor: apiKey, requerida: true, problema: 'No llego al build (vacia).', bloquea: true };
    }
    return {
      nombre: 'VITE_FIREBASE_API_KEY',
      valor: apiKey,
      requerida: true,
      // Todas las claves de API web de Firebase empiezan con "AIza", pero no
      // bloqueamos por esto: si esta mal, Firebase lo va a decir mejor que nosotros.
      problema: apiKey.startsWith('AIza') ? null : 'No parece una clave de API web: deberia empezar con "AIza".',
      bloquea: false,
    };
  };

  const revisarUrl = (): RevisionVariable => {
    const base = { nombre: 'VITE_FIREBASE_DATABASE_URL', valor: databaseURL, requerida: true };
    if (databaseURL === '') {
      return { ...base, problema: 'No llego al build (vacia).', bloquea: true };
    }
    if (databaseURL.includes('console.firebase.google.com')) {
      return { ...base, problema: 'Es el enlace de la consola, no la URL de la base.', bloquea: true };
    }
    if (!databaseURL.startsWith('https://')) {
      return { ...base, problema: 'Tiene que empezar con https://', bloquea: true };
    }
    if (!urlDeBaseValida(databaseURL)) {
      // El SDK tira un error fatal y deja la pagina en blanco si la URL trae path.
      return { ...base, problema: 'Tiene que ser solo el dominio de la base, sin ninguna ruta despues.', bloquea: true };
    }
    if (!/\.(firebaseio\.com|firebasedatabase\.app)$/.test(new URL(databaseURL).hostname)) {
      return { ...base, problema: 'Deberia terminar en .firebaseio.com o .firebasedatabase.app', bloquea: false };
    }
    return { ...base, problema: null, bloquea: false };
  };

  return [
    revisarApiKey(),
    revisarUrl(),
    opcional('VITE_FIREBASE_AUTH_DOMAIN', authDomain),
    opcional('VITE_FIREBASE_PROJECT_ID', projectId),
    opcional('VITE_FIREBASE_APP_ID', appId),
  ];
}

/**
 * `true` si se puede intentar inicializar Firebase. Se apoya en la misma
 * revision que muestra la pantalla de configuracion, para que no puedan
 * discrepar: cualquier problema bloqueante lleva a esa pantalla en lugar de
 * dejar que el SDK tire un error fatal con la pagina en blanco.
 */
export const firebaseConfigurado = !revisarConfiguracion().some((v) => v.bloquea);

/** Nodo raiz donde escribe el ESP32, sin barra final. */
export const RAIZ_POR_DEFECTO = '/bomba_oxigeno';

/**
 * Nodo raiz donde escribe el ESP32, normalizado: sin barra final y con barra
 * inicial. Una variable cargada pero vacia cae al default — si no, las lecturas
 * irian a la raiz de la base (`/ultima_medicion`) en vez de al nodo correcto, y
 * el error que devuelve Firebase no deja claro por que.
 */
export const DB_ROOT = (() => {
  const crudo = env(import.meta.env.VITE_DB_ROOT).replace(/\/+$/, '');
  if (crudo === '' || crudo === '/') return RAIZ_POR_DEFECTO;
  return crudo.startsWith('/') ? crudo : `/${crudo}`;
})();

/**
 * Umbrales de fabrica. Son el punto de partida: la app deja editarlos y guarda
 * los cambios en el navegador de cada uno (ver `lib/umbrales.ts`).
 */
export const umbralesPorDefecto = {
  tensionNominal: num(import.meta.env.VITE_TENSION_NOMINAL, 220),
  tensionMin: num(import.meta.env.VITE_TENSION_MIN, 198),
  tensionMax: num(import.meta.env.VITE_TENSION_MAX, 242),
  corrienteMax: num(import.meta.env.VITE_CORRIENTE_MAX, 12),
  potenciaMax: num(import.meta.env.VITE_POTENCIA_MAX, 2500),
  cosfiMin: num(import.meta.env.VITE_COSFI_MIN, 0.7),
  potenciaApagada: num(import.meta.env.VITE_POTENCIA_APAGADA, 15),
};

/** El ESP32 publica cada 5 s; damos margen antes de marcar la senal como caida. */
export const SEGUNDOS_PARA_DESACTUALIZADO = 20;
export const SEGUNDOS_PARA_SIN_DATOS = 120;
