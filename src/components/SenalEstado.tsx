import { haceCuanto, horaConSegundos } from '../lib/format';
import type { EstadoConexion } from '../lib/types';

const TEXTOS: Record<EstadoConexion, string> = {
  conectando: 'Conectando…',
  'en-vivo': 'En vivo',
  desactualizado: 'Senal demorada',
  'sin-datos': 'Sin datos del ESP32',
  error: 'Error de conexion',
};

interface Props {
  estado: EstadoConexion;
  ultimoMs: number | null;
  ahora: number;
}

export function SenalEstado({ estado, ultimoMs, ahora }: Props) {
  const detalle =
    ultimoMs !== null && ultimoMs > 0
      ? estado === 'en-vivo'
        ? horaConSegundos(ultimoMs)
        : haceCuanto(ultimoMs, ahora)
      : null;

  return (
    <span className={`senal senal--${estado}`} role="status">
      <span className="senal__punto" aria-hidden="true" />
      <span>{TEXTOS[estado]}</span>
      {detalle && <span style={{ color: 'var(--tinta-muted)' }}>· {detalle}</span>}
    </span>
  );
}
