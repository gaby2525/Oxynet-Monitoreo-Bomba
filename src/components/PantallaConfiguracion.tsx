import { revisarConfiguracion, type RevisionVariable } from '../lib/config';

/** La clave de API es publica, pero mostrarla entera igual es ruido. */
function valorVisible(v: RevisionVariable): string {
  if (v.valor === '') return '(vacia)';
  if (v.nombre === 'VITE_FIREBASE_API_KEY') {
    return `${v.valor.slice(0, 8)}… (${v.valor.length} caracteres)`;
  }
  return v.valor.length > 60 ? `${v.valor.slice(0, 60)}…` : v.valor;
}

/**
 * Se muestra cuando faltan las variables de entorno de Firebase. Lista una por
 * una cual llego y cual no: el valor se evalua sobre el bundle ya compilado,
 * asi que distingue "no la cargue" de "la cargue pero el build es anterior".
 */
export function PantallaConfiguracion() {
  const revision = revisarConfiguracion();
  const ningunaLlego = revision.every((v) => v.valor === '');

  return (
    <main className="tarjeta setup">
      <h1>Falta configurar Firebase</h1>
      <p>
        Esto es lo que encontro la app en el build que estas viendo. Las variables se leen{' '}
        <b>en el momento de compilar</b>, no en vivo: si figuran vacias acá, este build se armó
        antes de que estuvieran cargadas.
      </p>

      <table className="revision">
        <thead>
          <tr>
            <th scope="col">Variable</th>
            <th scope="col">Valor en el build</th>
          </tr>
        </thead>
        <tbody>
          {revision.map((v) => (
            <tr key={v.nombre}>
              <td>
                <span className={`punto punto--${v.problema ? (v.bloquea ? 'mal' : 'aviso') : 'bien'}`}>
                  {v.problema ? (v.bloquea ? '✗' : '▲') : '✓'}
                </span>
                <code>{v.nombre}</code>
                {!v.requerida && <span className="revision__opcional">opcional</span>}
              </td>
              <td>
                <code className="revision__valor">{valorVisible(v)}</code>
                {v.problema && (
                  <span className={`revision__problema${v.bloquea ? '' : ' revision__problema--leve'}`}>
                    {v.problema}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {ningunaLlego ? (
        <>
          <h2>No llego ninguna variable</h2>
          <p>Las dos causas habituales, en orden de frecuencia:</p>
          <ol>
            <li>
              <b>Estas mirando un deploy viejo.</b> Las URLs con sufijo
              (<code>…-ilkqdsed9-usuario.vercel.app</code>) son inmutables: quedan congeladas con el
              build del momento y nunca toman variables nuevas. Abri el dominio de produccion, el que
              no tiene sufijo.
            </li>
            <li>
              <b>Faltó redesplegar.</b> Cargar las variables no reconstruye nada:
              hay que ir a <b>Deployments → ⋯ → Redeploy</b> (o hacer un push nuevo).
            </li>
          </ol>
        </>
      ) : (
        <>
          <h2>Que revisar</h2>
          <p>
            Algunas variables si llegaron, asi que el build tomo la configuracion: lo que falta es
            corregir en el panel de la plataforma las marcadas con <b>✗</b> y volver a desplegar.
          </p>
        </>
      )}

      <h2>De donde salen los valores</h2>
      <ol>
        <li>
          Consola de Firebase → <b>Configuracion del proyecto → Tus apps → App web</b>. Si no existe
          una app web, crearla (no hace falta hosting).
        </li>
        <li>
          Copiar cada campo del objeto <code>firebaseConfig</code> a su variable, sin comillas y sin
          espacios al final.
        </li>
        <li>
          <code>VITE_FIREBASE_DATABASE_URL</code> es la URL de la base (termina en{' '}
          <code>.firebaseio.com</code> o <code>.firebasedatabase.app</code>), no el enlace de la
          consola. Si no figura en <code>firebaseConfig</code>, esta arriba de la tabla en{' '}
          <b>Realtime Database</b>.
        </li>
      </ol>

      <p>
        Mientras tanto se puede ver la interfaz con datos simulados agregando <code>?demo=1</code> a
        la URL.
      </p>
    </main>
  );
}
