import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';
import { firebaseConfig, firebaseConfigurado } from './config';

let app: FirebaseApp | null = null;
export let db: Database | null = null;
let auth: Auth | null = null;

/** Mensaje del SDK si la inicializacion fallo, para poder mostrarlo en pantalla. */
export let errorDeInicializacion: string | null = null;

function obtenerApp(): FirebaseApp | null {
  if (!firebaseConfigurado || errorDeInicializacion) return null;
  if (!app) {
    try {
      app = initializeApp(firebaseConfig);
    } catch (err) {
      errorDeInicializacion = err instanceof Error ? err.message : String(err);
      return null;
    }
  }
  return app;
}

function obtenerDb(): Database | null {
  const a = obtenerApp();
  if (!a) return null;
  if (!db) {
    try {
      db = getDatabase(a);
    } catch (err) {
      errorDeInicializacion = err instanceof Error ? err.message : String(err);
      return null;
    }
  }
  return db;
}

obtenerDb();
