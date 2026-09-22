import { useMemo } from 'react';
import {
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
import type { PuntoSerie } from '../lib/serie';
import type { LimiteMetrica } from '../lib/umbrales';
import { etiquetaEje, fechaHora, numero } from '../lib/format';

interface Props {
  serieTension: PuntoSerie[];
  serieCorriente: PuntoSerie[];
  limiteTension: LimiteMetrica;
  limiteCorriente: LimiteMetrica;
  desdeMs: number;
  hastaMs: number;
  colorTension: string;
  colorCorriente: string;
  grilla: string;
  eje: string;
  muted: string;
  critico: string;
  superficie: string;
  cargando: boolean;
}

function ContenidoTooltipDoble({
  active,
  payload,
}: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const ms = payload[0].payload.ms;

  return (
    <div className="tooltip">
      <div className="tooltip__hora">{fechaHora(ms)}</div>
      {payload.map((item, index) => (
        <div className="tooltip__fila" key={index}>
          <span>
            <span
              className="tooltip__marca"
              style={{ backgroundColor: item.color }}
            />
            {item.name}
          </span>
          <b>
            {numero(item.value as number, item.name === 'Tensión' ? 1 : 2)}{' '}
            {item.name === 'Tensión' ? 'V' : 'A'}
          </b>
        </div>
      ))}
    </div>
  );
}

export function GraficoTensionCorriente({
  serieTension,
  serieCorriente,
  limiteTension,
  limiteCorriente,
  desdeMs,
  hastaMs,
  colorTension,
  colorCorriente,
  grilla,
  eje,
  muted,
  critico,
  superficie,
  cargando,
}: Props) {
  // Combinamos las series por timestamp (ms)
  const datosCombinados = useMemo(() => {
    const mapa = new Map<number, { ms: number; tension?: number; corriente?: number }>();

    for (const p of serieTension) {
      mapa.set(p.ms, { ms: p.ms, tension: p.valor });
    }
    for (const p of serieCorriente) {
      const previo = mapa.get(p.ms) || { ms: p.ms };
      mapa.set(p.ms, { ...previo, corriente: p.valor });
    }

    return Array.from(mapa.values()).sort((a, b) => a.ms - b.ms);
  }, [serieTension, serieCorriente]);

  const rangoMs = hastaMs - desdeMs;

  return (
    <section className={`tarjeta gr${cargando ? ' cargando' : ''}`}>
      <div className="gr__cabecera">
        <h3 className="gr__titulo">Tensión y Corriente (Doble Eje Y)</h3>
      </div>
      <p className="gr__descripcion">
        Eje izquierdo: Tensión en Voltios (V) · Eje derecho: Corriente en Amperios (A)
      </p>

      {datosCombinados.length === 0 ? (
        <div className="gr--vacio">
          {cargando ? 'Cargando historial…' : 'Sin registros en el rango elegido.'}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={datosCombinados} margin={{ top: 10, right: 16, bottom: 4, left: 4 }}>
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

            {/* EJE IZQUIERDO: TENSIÓN (V) */}
            <YAxis
              yAxisId="tension"
              orientation="left"
              domain={['auto', 'auto']}
              stroke={colorTension}
              tick={{ fill: colorTension, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={46}
              tickFormatter={(v: number) => `${numero(v, 0)}V`}
            />

            {/* EJE DERECHO: CORRIENTE (A) */}
            <YAxis
              yAxisId="corriente"
              orientation="right"
              domain={[0, 'auto']}
              stroke={colorCorriente}
              tick={{ fill: colorCorriente, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={46}
              tickFormatter={(v: number) => `${numero(v, 1)}A`}
            />

            <Tooltip cursor={{ stroke: eje, strokeWidth: 1 }} content={<ContenidoTooltipDoble />} />

            {/* Línea Umbral de Tensión si aplica */}
            {limiteTension.min !== null && (
              <ReferenceLine yAxisId="tension" y={limiteTension.min} stroke={critico} strokeDasharray="5 4" />
            )}
            {/* Línea Umbral de Corriente si aplica */}
            {limiteCorriente.max !== null && (
              <ReferenceLine yAxisId="corriente" y={limiteCorriente.max} stroke={critico} strokeDasharray="5 4" />
            )}

            {/* LÍNEA DE TENSIÓN */}
            <Line
              yAxisId="tension"
              name="Tensión"
              dataKey="tension"
              stroke={colorTension}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4.5, stroke: superficie, strokeWidth: 2 }}
              isAnimationActive={false}
            />

            {/* LÍNEA DE CORRIENTE */}
            <Line
              yAxisId="corriente"
              name="Corriente"
              dataKey="corriente"
              stroke={colorCorriente}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4.5, stroke: superficie, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
