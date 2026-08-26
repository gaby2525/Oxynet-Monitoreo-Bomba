const EJEMPLO = `VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=oxynet-monitoreo-bomba.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://oxynet-monitoreo-bomba-default-rtdb.firebaseio.com
VITE_FIREBASE_PROJECT_ID=oxynet-monitoreo-bomba
VITE_FIREBASE_APP_ID=1:123...:web:abc...`;

/** Se muestra cuando faltan las variables de entorno de Firebase. */
export function PantallaConfiguracion() {
  return (
    <main className="tarjeta setup">
      <h1>Falta configurar Firebase</h1>
      <p>
        La app no encontro las variables de entorno de la Realtime Database, asi que no hay a donde
        conectarse. Se completan una sola vez:
      </p>
      <ol>
        <li>
          En la consola de Firebase: <b>Configuracion del proyecto → Tus apps → App web</b>. Si
          todavia no existe una app web, crearla (no hace falta hosting).
        </li>
        <li>
          Copiar los valores del objeto <code>firebaseConfig</code> a un archivo <code>.env</code> en
          la raiz del proyecto (partiendo de <code>.env.example</code>).
        </li>
        <li>
          En Vercel o Netlify, cargar las mismas variables en el panel de <b>Environment Variables</b>{' '}
          y volver a desplegar.
        </li>
      </ol>
      <pre>{EJEMPLO}</pre>
      <p>
        Mientras tanto se puede ver la interfaz con datos simulados agregando{' '}
        <code>?demo=1</code> a la URL.
      </p>
      <p>
        Ojo con <code>VITE_FIREBASE_DATABASE_URL</code>: es la URL que termina en{' '}
        <code>.firebaseio.com</code> (o <code>.firebasedatabase.app</code> si la base es regional),
        no el enlace de la consola.
      </p>
    </main>
  );
}
