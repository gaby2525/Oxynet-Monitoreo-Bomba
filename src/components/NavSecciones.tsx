import { SECCIONES, etiquetaDeSeccion, type Seccion } from '../hooks/useSeccion';

interface Props {
  seccion: Seccion;
  onIr: (s: Seccion) => void;
  /** Cantidad de alarmas activas, para marcar el Monitor cuando hay algo que ver. */
  alarmas: number;
}

export function NavSecciones({ seccion, onIr, alarmas }: Props) {
  return (
    <nav className="nav" aria-label="Secciones">
      {SECCIONES.map((s) => (
        <button
          key={s}
          type="button"
          className="nav__item"
          aria-current={seccion === s ? 'page' : undefined}
          onClick={() => onIr(s)}
        >
          {etiquetaDeSeccion(s)}
          {s === 'monitor' && alarmas > 0 && (
            <span className="nav__globo" aria-label={`${alarmas} alarmas activas`}>
              {alarmas}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
