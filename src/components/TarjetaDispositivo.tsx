import { useState } from 'react';
import { duracion, haceCuanto } from '../lib/format';
import { solicitarCambioDeWifi } from '../hooks/useEstadoDispositivo';
import { modoDemo } from '../lib/demo';
import type { CalidadSenal, EstadoDispositivo } from '../lib/types';

const TEXTO_CALIDAD: Record<CalidadSenal, string> = {
  excelente: 'Excelente',
  buena: 'Buena',
  regular: 'Regular',
  debil: 'Debil',
  desconocida: 'Sin dato',
};

/** RSSI en dBm no le dice nada a nadie; esto lo traduce a barras y palabras. */
export function calidadDeSenal(rssi: number): { calidad: CalidadSenal; barras: number } {
  if (!rssi || rssi >= 0) return { calidad: 'desconocida', barras: 0 };
  if (rssi >= -55) return { calidad: 'excelente', barras: 4 };
  if (rssi >= -67) return { calidad: 'buena', barras: 3 };
  if (rssi >= -78) return { calidad: 'regular', barras: 2 };
  return { calidad: 'debil', barras: 1 };
}

function Barras({ rssi }: { rssi: number }) {
  const { calidad, barras } = calidadDeSenal(rssi);
  const modificador =
    calidad === 'regular' ? ' barras--regular' : calidad === 'debil' ? ' barras--debil' : '';
  return (
    <span className={`barras${modificador}`} aria-hidden="true">
      {[1, 2, 3, 4].map((n) => (
        <i key={n} className={n <= barras ? 'on' : undefined} />
      ))}
    </span>
  );
}

interface Props {
  estado: EstadoDispositivo | null;
  ahora: number;
}

export function TarjetaDispositivo({ estado, ahora }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [ssid, setSsid] = useState('');
  const [clave, setClave] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  const enviar = async () => {
    if (ssid.trim() === '') {
      setResultado({ ok: false, texto: 'Falta el nombre de la red.' });
      return;
    }
    setEnviando(true);
    const r = await solicitarCambioDeWifi(ssid.trim(), clave);
    setEnviando(false);
    setResultado(
      r.ok
        ? {
            ok: true,
            texto:
              'Red enviada. El ESP32 la va a tomar en su proxima revision (hasta un minuto) y se va a reiniciar para conectarse.',
          }
        : { ok: false, texto: r.mensaje },
    );
    if (r.ok) setClave('');
  };

  const { calidad } = calidadDeSenal(estado?.rssi ?? 0);

  const dato = (rotulo: string, contenido: React.ReactNode, mono = false) => (
    <div className="dispositivo__dato">
      <span className="rotulo">{rotulo}</span>
      <b className={mono ? 'num' : undefined}>{contenido}</b>
    </div>
  );

  return (
    <section className="tarjeta dispositivo" aria-label="Dispositivo">
      <div className="dispositivo__acciones">
        <button
          type="button"
          className="boton"
          aria-expanded={abierto}
          onClick={() => setAbierto((a) => !a)}
        >
          {abierto ? 'Cancelar' : 'Cambiar red Wi-Fi'}
        </button>
      </div>

      {estado ? (
        <div className="dispositivo__grilla">
          {dato(
            'Red Wi-Fi',
            <>
              <Barras rssi={estado.rssi} />
              {estado.ssid}
            </>,
          )}
          {dato(
            'Senal',
            <>
              {TEXTO_CALIDAD[calidad]}
              {estado.rssi < 0 ? ` · ${estado.rssi} dBm` : ''}
            </>,
            true,
          )}
          {dato('Direccion IP', estado.ip, true)}
          {dato('MAC', estado.mac, true)}
          {dato('Encendido hace', duracion(estado.uptimeS), true)}
          {dato('Firmware', estado.firmware)}
          {dato(
            'Ultimo reporte',
            estado.ms > 0 ? haceCuanto(estado.ms, ahora) : '—',
            true,
          )}
          {estado.pzemOk !== null &&
            dato(
              'Sensor PZEM-004T',
              <span className={`chip chip--${estado.pzemOk ? 'ok' : 'critical'}`}>
                <span className="chip__icono" aria-hidden="true">
                  {estado.pzemOk ? '✓' : '■'}
                </span>
                {estado.pzemOk ? 'Responde' : 'No responde'}
              </span>,
            )}
          {estado.pzemFallas > 0 && dato('Fallas del sensor', String(estado.pzemFallas), true)}
        </div>
      ) : (
        <p className="metrica__pie">
          El ESP32 todavia no publico su estado. Aparece en cuanto corra el firmware nuevo, que es el
          que informa red, senal e IP.
        </p>
      )}

      {abierto && (
        <div className="wifi-form">
          <p className="umbrales__intro">
            Deja una red preparada para que el ESP32 la tome en su proxima revision, sin tener que
            desmontarlo ni abrir el IDE de Arduino. Si la red nueva falla, el equipo vuelve solo a la
            anterior; y si no logra conectarse a ninguna, levanta su propia red{' '}
            <code>Oxynet-Bomba</code> para configurarlo desde el celular parado al lado.
          </p>
          <div className="wifi-form__campos">
            <label className="campo">
              <span>Nombre de la red (SSID)</span>
              <input
                type="text"
                value={ssid}
                autoComplete="off"
                placeholder="Oxynet-Taller"
                onChange={(e) => setSsid(e.target.value)}
              />
            </label>
            <label className="campo">
              <span>Contrasena</span>
              <input
                type="password"
                value={clave}
                autoComplete="new-password"
                placeholder="dejar vacio si es abierta"
                onChange={(e) => setClave(e.target.value)}
              />
            </label>
          </div>
          <div className="wifi-form__acciones">
            <button
              type="button"
              className="boton boton--principal"
              disabled={enviando || modoDemo}
              onClick={enviar}
            >
              {enviando ? 'Enviando…' : 'Enviar al ESP32'}
            </button>
            {resultado && (
              <span
                style={{
                  fontSize: 12,
                  color: resultado.ok ? 'var(--bueno)' : 'var(--critico)',
                }}
              >
                {resultado.texto}
              </span>
            )}
          </div>
          <p className="metrica__pie" style={{ marginTop: 12 }}>
            La contrasena se guarda en un nodo que las reglas dejan escribir pero no leer: solo el
            ESP32 puede recuperarla. Aun asi, cualquiera con acceso al panel puede reemplazar la red
            del equipo.
          </p>
        </div>
      )}
    </section>
  );
}
