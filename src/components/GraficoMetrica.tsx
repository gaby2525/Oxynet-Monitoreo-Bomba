import { useMemo } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TooltipProps } from 'recharts';
import type { ColoresGrafico } from '../hooks/useColores';
import type { DefinicionMetrica } from '../lib/metricas';
import type { Estadisticas, PuntoSerie } from '../lib/serie';
import { etiquetaEje, fechaHora, numero } from '../lib/format';

interface Props {
  definicion: DefinicionMetrica;
  serie: PuntoSerie[];
  agregado: boolean;
  stats: Estadisticas | null;
  desdeMs: number;
  hastaMs: number;
  colores: ColoresGrafico;
  cargando: boolean;
}

/** Paso de grilla "redondo" (1, 2, 2.5 o 5 por decada) mas cercano al pedido. */
function pasoLindo(bruto: number): number {
  if (!Number.isFinite(bruto) || bruto <= 0) return 1;
  const base = 10 ** Math.floor(Math.log10(bruto));
  const norm = bruto / base;
  const mult = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return mult * base;
}

/**
 * Dominio vertical ajustado a los datos, ampliado para incluir un umbral solo
 * cuando esta razonablemente cerca; si no, el grafico se aplastaria contra un
 * limite que nunca se acerca. Los extremos se redondean a un paso lindo para
 * que las marcas del eje no queden en 244,1 o 4.158.
 */
function dominioY(
  serie: PuntoSerie[],
  clave: string,
  banda?: { min?: number; max?: number },
): [number, number] {
  if (serie.length === 0) return [0, 1];

  let min = Infinity;
  let max = -Infinity;
  for (const p of serie) {
    if (p.rango[0] < min) min = p.rango[0];
    if (p.rango[1] > max) max = p.rango[1];
  }

  const span = max - min || Math.max(Math.abs(max) * 0.1, 1);
  let lo = min - span * 0.15;
  let hi = max + span * 0.15;

  if (banda?.min !== undefined && banda.min >= min - span * 3) lo = Math.min(lo, banda.min - span * 0.15);
  if (banda?.max !== undefined && banda.max <= max + span * 3) hi = Math.max(hi, banda.max + span * 0.15);

  if (clave === 'cosfi') return [0, 1];
  if (clave === 'corriente' || clave === 'potencia') lo = Math.max(0, lo);

  const paso = pasoLindo((hi - lo) / 4);
  lo = Math.floor(lo / paso) * paso;
  hi = Math.ceil(hi / paso) * paso;
  if (clave === 'corriente' || clave === 'potencia') lo = Math.max(0, lo);

  // Redondeo defensivo: floor/ceil sobre pasos decimales deja colas de binario.
  const redondear = (n: number) => Math.round(n * 1e6) / 1e6;
  return [redondear(lo), redondear(hi)];
}

function ContenidoTooltip({
  active,
  payload,
  definicion,
  agregado,
}: TooltipProps<number, string> & { definicion: DefinicionMetrica; agregado: boolean }) {
  if (!active || !payload || payload.length === 0) return null;
  const punto = payload[0].payload as PuntoSerie;

  return (
    <div className="tooltip">
      <div className="tooltip__hora">{fechaHora(punto.ms)}</div>
      <div className="tooltip__fila">
        <span>
          <span className="tooltip__marca" aria-hidden="true" />
          {definicion.etiqueta}
        </span>
        <b>
          {numero(punto.valor, definicion.decimales)} {definicion.unidad}
        </b>
      </div>
      {agregado && punto.muestras > 1 && (
        <div className="tooltip__rango">
          min {numero(punto.rango[0], definicion.decimales)} · max{' '}
          {numero(punto.rango[1], definicion.decimales)} · {punto.muestras} muestras
        </div>
      )}
    </div>
  );
}

export function GraficoMetrica({
  definicion,
  serie,
  agregado,
  stats,
  desdeMs,
  hastaMs,
  colores,
  cargando,
}: Props) {
  const dominio = useMemo(
    () => dominioY(serie, definicion.clave, definicion.banda),
    [serie, definicion.clave, definicion.banda],
  );
  const rangoMs = hastaMs - desdeMs;
  const u = definicion.unidad ? ` ${definicion.unidad}` : '';

  return (
    <section className={`tarjeta gr${cargando ? ' cargando' : ''}`}>
      <div className="gr__cabecera">
        <h3 className="gr__titulo">
          {definicion.etiqueta}
          {definicion.unidad ? ` (${definicion.unidad})` : ''}
        </h3>
      </div>
      <p className="gr__descripcion">
        {definicion.descripcion}
        {definicion.banda && ' La linea punteada roja marca el limite.'}
      </p>

      {serie.length === 0 ? (
        <div className="gr--vacio">
          {cargando ? 'Cargando historial…' : 'Sin registros en el rango elegido.'}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={228}>
          <ComposedChart data={serie} margin={{ top: 6, right: 16, bottom: 4, left: 4 }}>
            <CartesianGrid stroke={colores.grilla} strokeWidth={1} vertical={false} />
            <XAxis
              dataKey="ms"
              type="number"
              scale="time"
              domain={[desdeMs, hastaMs]}
              tickFormatter={(ms: number) => etiquetaEje(ms, rangoMs)}
              stroke={colores.eje}
              tick={{ fill: colores.muted, fontSize: 11 }}
              tickLine={false}
              minTickGap={44}
            />
            <YAxis
              domain={dominio}
              stroke={colores.eje}
              tick={{ fill: colores.muted, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={46}
              tickFormatter={(v: number) => numero(v, definicion.decimales > 0 ? 1 : 0)}
            />

            {/* Envolvente min-max del bucket: misma serie, no una segunda. */}
            {agregado && (
              <Area
                dataKey="rango"
                stroke="none"
                fill={colores.serieSuave}
                isAnimationActive={false}
                activeDot={false}
              />
            )}

            {definicion.banda?.min !== undefined && definicion.banda.min >= dominio[0] && (
              <ReferenceLine
                y={definicion.banda.min}
                stroke={colores.critico}
                strokeDasharray="5 4"
                strokeWidth={1}
              />
            )}
            {definicion.banda?.max !== undefined && definicion.banda.max <= dominio[1] && (
              <ReferenceLine
                y={definicion.banda.max}
                stroke={colores.critico}
                strokeDasharray="5 4"
                strokeWidth={1}
              />
            )}

            <Tooltip
              cursor={{ stroke: colores.eje, strokeWidth: 1 }}
              content={<ContenidoTooltip definicion={definicion} agregado={agregado} />}
            />
            <Line
              dataKey="valor"
              stroke={colores.serie}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4.5, stroke: colores.superficie, strokeWidth: 2 }}
              isAnimationActive={false}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {stats && (
        <div className="gr__resumen">
          <span>
            min <b>{numero(stats.min, definicion.decimales)}</b>
            {u}
          </span>
          <span>
            prom <b>{numero(stats.promedio, definicion.decimales)}</b>
            {u}
          </span>
          <span>
            max <b>{numero(stats.max, definicion.decimales)}</b>
            {u}
          </span>
          <span>
            ultimo <b>{numero(stats.ultimo, definicion.decimales)}</b>
            {u}
          </span>
        </div>
      )}
    </section>
  );
}
