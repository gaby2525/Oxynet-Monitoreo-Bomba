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
import type { DefinicionMetrica } from '../lib/metricas';
import type { Estadisticas, PuntoSerie } from '../lib/serie';
import type { LimiteMetrica } from '../lib/umbrales';
import { etiquetaEje, fechaHora, numero } from '../lib/format';

interface Props {
  definicion: DefinicionMetrica;
  descripcion: string;
  limite: LimiteMetrica;
  serie: PuntoSerie[];
  agregado: boolean;
  stats: Estadisticas | null;
  desdeMs: number;
  hastaMs: number;
  color: string;
  colorSuave: string;
  grilla: string;
  eje: string;
  muted: string;
  critico: string;
  superficie: string;
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
 * limite que nunca se acerca. Los extremos se redondean a un paso lindo.
 */
function dominioY(serie: PuntoSerie[], clave: string, limite: LimiteMetrica): [number, number] {
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

  if (limite.min !== null && limite.min >= min - span * 3) lo = Math.min(lo, limite.min - span * 0.15);
  if (limite.max !== null && limite.max <= max + span * 3) hi = Math.max(hi, limite.max + span * 0.15);

  if (clave === 'cosfi') return [0, 1];
  if (clave === 'corriente' || clave === 'potencia') lo = Math.max(0, lo);

  const paso = pasoLindo((hi - lo) / 4);
  lo = Math.floor(lo / paso) * paso;
  hi = Math.ceil(hi / paso) * paso;
  if (clave === 'corriente' || clave === 'potencia') lo = Math.max(0, lo);

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
          {definicion.corta}
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
  descripcion,
  limite,
  serie,
  agregado,
  stats,
  desdeMs,
  hastaMs,
  color,
  colorSuave,
  grilla,
  eje,
  muted,
  critico,
  superficie,
  cargando,
}: Props) {
  const dominio = useMemo(
    () => dominioY(serie, definicion.clave, limite),
    [serie, definicion.clave, limite],
  );
  const rangoMs = hastaMs - desdeMs;
  const u = definicion.unidad ? ` ${definicion.unidad}` : '';
  const d = definicion.decimales;

  const stat = (etiqueta: string, valor: number | null) => (
    <div className="gr__stat">
      <span>{etiqueta}</span>
      <b>
        {numero(valor, d)}
        {u}
      </b>
    </div>
  );

  return (
    <section
      className={`tarjeta gr${cargando ? ' cargando' : ''}`}
      style={{ '--acento': color } as React.CSSProperties}
    >
      <div className="gr__cabecera">
        <span className="gr__marca" aria-hidden="true" />
        <h3 className="gr__titulo">{definicion.etiqueta}</h3>
        {definicion.unidad && <span className="gr__unidad">({definicion.unidad})</span>}
      </div>
      <p className="gr__descripcion">
        {descripcion}
        {(limite.min !== null || limite.max !== null) && ' La linea punteada roja marca el limite.'}
      </p>

      {serie.length === 0 ? (
        <div className="gr--vacio">
          {cargando ? 'Cargando historial…' : 'Sin registros en el rango elegido.'}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={224}>
          <ComposedChart data={serie} margin={{ top: 6, right: 16, bottom: 4, left: 4 }}>
            <CartesianGrid stroke={grilla} strokeWidth={1} vertical={false} />
            <XAxis
              dataKey="ms"
              type="number"
              scale="time"
              domain={[desdeMs, hastaMs]}
              tickFormatter={(ms: number) => etiquetaEje(ms, rangoMs)}
              stroke={eje}
              tick={{ fill: muted, fontSize: 11 }}
              tickLine={false}
              minTickGap={46}
            />
            <YAxis
              domain={dominio}
              stroke={eje}
              tick={{ fill: muted, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={46}
              tickFormatter={(v: number) => numero(v, d > 0 ? 1 : 0)}
            />

            {/* Envolvente min-max del bucket: misma serie, no una segunda. */}
            {agregado && (
              <Area
                dataKey="rango"
                stroke="none"
                fill={colorSuave}
                isAnimationActive={false}
                activeDot={false}
              />
            )}

            {limite.min !== null && limite.min >= dominio[0] && (
              <ReferenceLine y={limite.min} stroke={critico} strokeDasharray="5 4" strokeWidth={1} />
            )}
            {limite.max !== null && limite.max <= dominio[1] && (
              <ReferenceLine y={limite.max} stroke={critico} strokeDasharray="5 4" strokeWidth={1} />
            )}

            <Tooltip
              cursor={{ stroke: eje, strokeWidth: 1 }}
              content={<ContenidoTooltip definicion={definicion} agregado={agregado} />}
            />
            <Line
              dataKey="valor"
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4.5, stroke: superficie, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {stats && (
        <div className="gr__resumen">
          {stat('Min', stats.min)}
          {stat('Prom', stats.promedio)}
          {stats.promedioEnMarcha !== null && stat('Prom. marcha', stats.promedioEnMarcha)}
          {stat('Max', stats.max)}
          {stat('Desvio', stats.desvio)}
          {stat('Ultimo', stats.ultimo)}
        </div>
      )}
    </section>
  );
}
