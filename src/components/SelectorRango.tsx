import { useEffect, useState } from 'react';
import {
  RANGOS,
  RANGO_PERSONALIZADO,
  aValorInput,
  desdeValorInput,
  type Rango,
  type Ventana,
} from '../lib/rangos';

interface Props {
  rango: Rango;
  ventana: Ventana;
  onElegirRango: (r: Rango) => void;
  onElegirVentana: (v: Ventana) => void;
}

export function SelectorRango({ rango, ventana, onElegirRango, onElegirVentana }: Props) {
  const esPersonalizado = rango.id === RANGO_PERSONALIZADO.id;
  const [desde, setDesde] = useState(() => aValorInput(ventana.desdeMs));
  const [hasta, setHasta] = useState(() => aValorInput(ventana.hastaMs));
  const [error, setError] = useState<string | null>(null);

  // Al entrar en personalizado se arranca desde la ventana que se estaba viendo.
  useEffect(() => {
    if (esPersonalizado) {
      setDesde(aValorInput(ventana.desdeMs));
      setHasta(aValorInput(ventana.hastaMs));
    }
  }, [esPersonalizado]);

  const aplicar = () => {
    const d = desdeValorInput(desde);
    const h = desdeValorInput(hasta);
    if (d === null || h === null) return setError('Fechas incompletas.');
    if (d >= h) return setError('La fecha de inicio tiene que ser anterior a la de fin.');
    setError(null);
    onElegirVentana({ desdeMs: d, hastaMs: h });
  };

  return (
    <>
      <div className="segmentado" role="group" aria-label="Rango de tiempo">
        {[...RANGOS, RANGO_PERSONALIZADO].map((r) => (
          <button
            key={r.id}
            type="button"
            aria-pressed={rango.id === r.id}
            onClick={() => onElegirRango(r)}
          >
            {r.etiqueta}
          </button>
        ))}
      </div>

      {esPersonalizado && (
        <div className="wifi-form__campos" style={{ width: '100%', marginTop: 4 }}>
          <label className="campo">
            <span>Desde</span>
            <input
              type="datetime-local"
              value={desde}
              max={hasta}
              onChange={(e) => setDesde(e.target.value)}
            />
          </label>
          <label className="campo">
            <span>Hasta</span>
            <input
              type="datetime-local"
              value={hasta}
              min={desde}
              onChange={(e) => setHasta(e.target.value)}
            />
          </label>
          <div className="wifi-form__acciones" style={{ marginTop: 0 }}>
            <button type="button" className="boton boton--principal" onClick={aplicar}>
              Aplicar rango
            </button>
            <button
              type="button"
              className="boton"
              onClick={() => {
                const ahora = Date.now();
                setDesde(aValorInput(ahora - 24 * 3600_000));
                setHasta(aValorInput(ahora));
              }}
            >
              Ultimas 24 h
            </button>
            {error && <span style={{ color: 'var(--critico)', fontSize: 12 }}>{error}</span>}
          </div>
        </div>
      )}
    </>
  );
}
