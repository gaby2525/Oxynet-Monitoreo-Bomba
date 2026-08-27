import { useEffect, useState } from 'react';
import { METRICAS } from '../lib/metricas';
import { fueronEditados, sanear, type Umbrales } from '../lib/umbrales';
import type { ClaveMetrica } from '../lib/types';

/** Los inputs son texto: vacio significa "sin limite", que no es lo mismo que 0. */
type Borrador = Record<string, string>;

const aBorrador = (u: Umbrales): Borrador => {
  const b: Borrador = {
    tensionNominal: String(u.tensionNominal),
    potenciaApagada: String(u.potenciaApagada),
  };
  for (const m of METRICAS) {
    b[`${m.clave}.min`] = u[m.clave].min === null ? '' : String(u[m.clave].min);
    b[`${m.clave}.max`] = u[m.clave].max === null ? '' : String(u[m.clave].max);
  }
  return b;
};

const desdeBorrador = (b: Borrador): Umbrales => {
  const crudo: Record<string, unknown> = {
    tensionNominal: b.tensionNominal,
    potenciaApagada: b.potenciaApagada,
  };
  for (const m of METRICAS) {
    crudo[m.clave] = { min: b[`${m.clave}.min`], max: b[`${m.clave}.max`] };
  }
  return sanear(crudo);
};

interface Props {
  umbrales: Umbrales;
  colores: string[];
  onGuardar: (u: Umbrales) => void;
  onRestablecer: () => void;
}

export function PanelUmbrales({ umbrales, colores, onGuardar, onRestablecer }: Props) {
  const [borrador, setBorrador] = useState<Borrador>(() => aBorrador(umbrales));
  const [guardado, setGuardado] = useState(false);

  // Si los umbrales cambian desde afuera (restablecer), el formulario los sigue.
  useEffect(() => {
    setBorrador(aBorrador(umbrales));
  }, [umbrales]);

  const set = (campo: string, valor: string) => {
    setBorrador((b) => ({ ...b, [campo]: valor }));
    setGuardado(false);
  };

  const invertido = (clave: ClaveMetrica) => {
    const min = Number(borrador[`${clave}.min`]);
    const max = Number(borrador[`${clave}.max`]);
    return (
      borrador[`${clave}.min`] !== '' &&
      borrador[`${clave}.max`] !== '' &&
      Number.isFinite(min) &&
      Number.isFinite(max) &&
      min > max
    );
  };

  const hayInvertidos = METRICAS.some((m) => invertido(m.clave));

  const guardar = () => {
    onGuardar(desdeBorrador(borrador));
    setGuardado(true);
  };

  return (
    <section className="tarjeta umbrales" aria-label="Umbrales de alarma">
      <p className="umbrales__intro">
        Definen cuando una lectura se marca como fuera de rango y disparan las alarmas de arriba.
        Dejar un campo vacio quita ese limite. Se guardan en este navegador, asi que valen para esta
        computadora: en el celular hay que cargarlos de nuevo.
      </p>

      <div className="umbrales__grilla">
        {METRICAS.map((m, i) => (
          <div className="umbral" key={m.clave} style={{ '--acento': colores[i] } as React.CSSProperties}>
            <div className="umbral__titulo">
              <span className="umbral__marca" aria-hidden="true" />
              <span className="rotulo">
                {m.corta}
                {m.unidad ? ` (${m.unidad})` : ''}
              </span>
            </div>
            <div className="umbral__par">
              <label className="campo">
                <span>Minimo</span>
                <input
                  type="number"
                  step={m.paso}
                  inputMode="decimal"
                  placeholder="sin limite"
                  value={borrador[`${m.clave}.min`]}
                  aria-invalid={invertido(m.clave)}
                  onChange={(e) => set(`${m.clave}.min`, e.target.value)}
                />
              </label>
              <label className="campo">
                <span>Maximo</span>
                <input
                  type="number"
                  step={m.paso}
                  inputMode="decimal"
                  placeholder="sin limite"
                  value={borrador[`${m.clave}.max`]}
                  aria-invalid={invertido(m.clave)}
                  onChange={(e) => set(`${m.clave}.max`, e.target.value)}
                />
              </label>
            </div>
          </div>
        ))}

        <div className="umbral">
          <div className="umbral__titulo">
            <span className="rotulo">Referencias</span>
          </div>
          <div className="umbral__par">
            <label className="campo">
              <span>Tension nominal (V)</span>
              <input
                type="number"
                step={1}
                inputMode="decimal"
                value={borrador.tensionNominal}
                onChange={(e) => set('tensionNominal', e.target.value)}
              />
            </label>
            <label className="campo">
              <span title="Por debajo de esta potencia se considera detenida">Bomba parada (W)</span>
              <input
                type="number"
                step={5}
                inputMode="decimal"
                value={borrador.potenciaApagada}
                onChange={(e) => set('potenciaApagada', e.target.value)}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="umbrales__pie">
        <span className="umbrales__aviso">
          {hayInvertidos
            ? 'Hay un minimo mayor que su maximo: ese par se va a descartar al guardar.'
            : guardado
              ? 'Umbrales guardados.'
              : fueronEditados(umbrales)
                ? 'Estas usando umbrales propios, distintos de los de fabrica.'
                : 'Estas usando los umbrales de fabrica.'}
        </span>
        <button type="button" className="boton" onClick={onRestablecer}>
          Restablecer
        </button>
        <button type="button" className="boton boton--principal" onClick={guardar}>
          Guardar umbrales
        </button>
      </div>
    </section>
  );
}
