import type { Tema } from '../hooks/useTema';

const OPCIONES: { valor: Tema; etiqueta: string; titulo: string }[] = [
  { valor: 'claro', etiqueta: '☀', titulo: 'Tema claro' },
  { valor: 'oscuro', etiqueta: '☾', titulo: 'Tema oscuro' },
  { valor: 'sistema', etiqueta: 'Auto', titulo: 'Seguir al sistema' },
];

export function SelectorTema({ tema, onCambiar }: { tema: Tema; onCambiar: (t: Tema) => void }) {
  return (
    <div className="selector-tema" role="group" aria-label="Tema de la interfaz">
      {OPCIONES.map((o) => (
        <button
          key={o.valor}
          type="button"
          title={o.titulo}
          aria-label={o.titulo}
          aria-pressed={tema === o.valor}
          onClick={() => onCambiar(o.valor)}
        >
          {o.etiqueta}
        </button>
      ))}
    </div>
  );
}
