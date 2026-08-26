import { fechaHora, numero } from '../lib/format';
import type { PuntoHistorial } from '../lib/types';
import type { Umbrales } from '../lib/umbrales';

const MAX_FILAS = 500;

export function TablaRegistros({
  puntos,
  umbrales,
}: {
  puntos: PuntoHistorial[];
  umbrales: Umbrales;
}) {
  if (puntos.length === 0) {
    return <div className="tarjeta gr--vacio">Sin registros en el rango elegido.</div>;
  }

  const masRecientesPrimero = [...puntos].reverse();
  const visibles = masRecientesPrimero.slice(0, MAX_FILAS);

  return (
    <div className="tabla-envoltorio">
      <table>
        <caption className="sr-only">
          Registros del historial en el rango seleccionado, del mas reciente al mas antiguo.
        </caption>
        <thead>
          <tr>
            <th scope="col">Fecha y hora</th>
            <th scope="col">Tension (V)</th>
            <th scope="col">Corriente (A)</th>
            <th scope="col">Potencia (W)</th>
            <th scope="col">cos φ</th>
            <th scope="col">Aparente (VA)</th>
            <th scope="col">Estado</th>
          </tr>
        </thead>
        <tbody>
          {visibles.map((p) => (
            <tr key={p.ms}>
              <td>{fechaHora(p.ms)}</td>
              <td>{numero(p.tension, 1)}</td>
              <td>{numero(p.corriente, 2)}</td>
              <td>{numero(p.potencia, 0)}</td>
              <td>{numero(p.cosfi, 2)}</td>
              <td>{numero(p.tension * p.corriente, 0)}</td>
              <td className="celda-estado">
                {p.potencia > umbrales.potenciaApagada ? 'En marcha' : 'Detenida'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {masRecientesPrimero.length > MAX_FILAS && (
        <p className="tabla-limite">
          Mostrando los {MAX_FILAS} registros mas recientes de {masRecientesPrimero.length}. El CSV
          trae el rango completo.
        </p>
      )}
    </div>
  );
}
