import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';
import { firebaseConfig, firebaseConfigurado } from './config';

let app: FirebaseApp | null = null;
let db: Database | null = null;
let auth: Auth | null = null;

function obtenerApp(): FirebaseApp | null {
  if (!firebaseConfigurado) return null;
  app = app ?? initializeApp(firebaseConfig);
  return app;
}

/**
 * Instancia de la Realtime Database, o `null` si faltan las variables de
 * entorno (asi la app muestra la pantalla de configuracion en vez de romperse).
 */
export function obtenerDb(): Database | null {
  const a = obtenerApp();
  if (!a) return null;
  db = db ?? getDatabase(a);
  return db;
}

export function obtenerAuth(): Auth | null {
  const a = obtenerApp();
  if (!a) return null;
  auth = auth ?? getAuth(a);
  return auth;
}
