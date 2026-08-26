# Oxynet · Monitoreo de la bomba de oxígeno

Panel web para seguir en vivo los valores eléctricos de la bomba trifásica: un ESP32 con un
PZEM-004T publica en Firebase Realtime Database y esta app los muestra con tarjetas de estado,
alarmas por umbral, gráficos históricos y exportación a CSV.

Hecha con Vite + React + TypeScript, sin backend propio: es un sitio estático que se conecta
directo a la base. Se despliega igual de bien en Vercel o en Netlify.

---

## ⚠️ Primero que nada: rotar las credenciales

El sketch que veníamos usando traía esto:

```cpp
#define FIREBASE_AUTH "eiBKFYCeMBNMBycYYZR6bQNZxGJS6ZHet2Iy6B0U"
```

Eso es un **database secret** de Firebase, y equivale a una clave de administrador: quien lo tenga
puede leer, escribir y **borrar toda la base** sin ninguna restricción. Como ya circuló en texto
plano (chat, mail, historial de git), hay que darlo de baja:

1. Consola de Firebase → ⚙️ **Configuración del proyecto** → pestaña **Cuentas de servicio** →
   **Secretos de base de datos** → revocar el secreto que aparece listado.
2. Consola de Firebase → **Authentication** → pestaña **Sign-in method** → habilitar
   **Correo electrónico/contraseña** y, en **Users**, crear un usuario solo para el dispositivo
   (por ejemplo `esp32-bomba@oxynet.local`).
3. Cargar ese usuario y contraseña en el firmware nuevo (`firmware/oxynet_esp32/`), que ya está
   escrito para autenticarse así.
4. Publicar las reglas de `firebase/database.rules.json`, que limitan la escritura al UID de ese
   usuario.

La `apiKey` que usa la app web, en cambio, **sí** es pública por diseño: viaja dentro del bundle de
cualquier app web de Firebase. Lo que protege los datos son las reglas, no esconder esa clave.

---

## Qué muestra el panel

**Estado y valores instantáneos**

- Bomba en marcha / detenida, deducido de la potencia activa.
- Tensión, corriente, potencia y factor de potencia, cada uno con su estado (normal / atención /
  fuera de rango) según los umbrales configurados.
- Consumo acumulado (kWh del PZEM), potencia trifásica estimada, tiempo en marcha y cantidad de
  arranques dentro del rango elegido.
- Indicador de señal: avisa cuando hace más de 20 s que no llega una lectura nueva.

**Alarmas**

Se calculan sobre la última medición y aparecen arriba de todo: subtensión, sobretensión,
sobrecorriente, corriente elevada (>85 % del máximo) y factor de potencia bajo. Con la bomba
detenida no se disparan alarmas de corriente ni de cos φ, porque en reposo esos valores en cero son
lo esperado.

**Historial**

- Rangos de 15 min, 1 h, 6 h, 24 h y 7 días.
- Cuatro gráficos (tensión, corriente, potencia, cos φ) con crosshair, tooltip, línea de umbral y,
  cuando el rango obliga a agrupar muestras, la envolvente mín–máx de cada bucket — así los picos de
  arranque no se pierden en el promedio.
- Vista de tabla equivalente y descarga en CSV (separador `;` y coma decimal, listo para Excel en
  español).
- Tema claro / oscuro / automático.

**Modo demostración**

Agregando `?demo=1` a la URL, la app genera datos sintéticos. Sirve para ver la interfaz sin el
ESP32 encendido, o para verificar que el deploy quedó bien antes de conectar la base.

---

## Puesta en marcha local

```bash
npm install
cp .env.example .env      # completar con los datos del proyecto de Firebase
npm run dev
```

Queda en http://localhost:5173.

### De dónde salen las variables de entorno

Consola de Firebase → ⚙️ **Configuración del proyecto** → **Tus apps** → app web (si no hay ninguna,
crearla; no hace falta activar Hosting). Ahí aparece el objeto `firebaseConfig`, y cada campo va a su
variable:

| Variable | Valor |
|---|---|
| `VITE_FIREBASE_API_KEY` | `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `VITE_FIREBASE_DATABASE_URL` | `databaseURL` |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `VITE_FIREBASE_APP_ID` | `appId` |

`VITE_FIREBASE_DATABASE_URL` es la que más se presta a confusión: tiene que ser la URL de la base
(`https://oxynet-monitoreo-bomba-default-rtdb.firebaseio.com`, o terminada en
`.firebasedatabase.app` si la base es regional), **no** el enlace de la consola que empieza con
`https://console.firebase.google.com/...`.

### Umbrales

Se ajustan también por variables de entorno, sin tocar código:

| Variable | Por defecto | Qué es |
|---|---|---|
| `VITE_TENSION_NOMINAL` | 220 | Tensión nominal de referencia |
| `VITE_TENSION_MIN` / `VITE_TENSION_MAX` | 198 / 242 | Rango admitido (±10 %) |
| `VITE_CORRIENTE_MAX` | 12 | Corriente máxima admitida, en A |
| `VITE_COSFI_MIN` | 0.7 | cos φ mínimo esperado con la bomba en marcha |
| `VITE_POTENCIA_APAGADA` | 15 | Por debajo de estos W se considera la bomba detenida |
| `VITE_DB_ROOT` | `/bomba_oxigeno` | Nodo raíz donde escribe el ESP32 |

Los valores por defecto son razonables para 220 V, pero **conviene ajustar `VITE_CORRIENTE_MAX` a la
chapa del motor**: la corriente nominal más un margen del 10-15 %, no un número inventado.

---

## Reglas de la base

En `firebase/` hay dos variantes:

- **`database.rules.json`** (recomendada): lectura solo con sesión iniciada, escritura solo para el
  UID del ESP32, y validación de tipos y rangos en cada campo. Para que el panel pueda leer hay que
  habilitar **Authentication → Sign-in method → Anónimo**; la app inicia sesión anónima sola.
- **`database.rules.lectura-publica.json`**: más simple, deja el historial legible por cualquiera que
  conozca la URL. Solo si no importa que los datos sean públicos.

En las dos hay que reemplazar `UID_DEL_ESP32` por el UID real, que se ve en
**Authentication → Users**.

Si el inicio de sesión anónimo está deshabilitado, la app no se rompe: avisa con una nota y sigue
leyendo sin sesión, que es lo correcto con las reglas de lectura pública.

---

## Deploy

Las dos plataformas sirven igual. Vercel tiene la integración con GitHub un poco más directa; con
Netlify el `netlify.toml` ya deja todo resuelto. Elegir una:

### Vercel

1. **Add New → Project** e importar este repositorio.
2. El framework se detecta como Vite y toma `vercel.json`; no hay que tocar el build.
3. En **Settings → Environment Variables** cargar todas las `VITE_*` (para Production, Preview y
   Development).
4. Deploy.

### Netlify

1. **Add new site → Import an existing project** y elegir el repositorio.
2. Build command `npm run build`, publish directory `dist` — ya vienen en `netlify.toml`.
3. En **Site configuration → Environment variables** cargar las `VITE_*`.
4. Deploy.

### Si después de desplegar sigue apareciendo "Falta configurar Firebase"

Esa pantalla lista **una por una** las variables y qué valor quedó dentro del build que estás
viendo, así que dice sola dónde está el problema. Las causas, en orden de frecuencia:

1. **Estás mirando un deploy viejo.** Las URLs con sufijo
   (`oxynet-monitoreo-bomba-ilkqdsed9-usuario.vercel.app`) son inmutables: quedan congeladas con el
   build del momento y nunca toman variables nuevas. Hay que abrir el dominio de producción, el que
   no tiene sufijo.
2. **Faltó redesplegar.** Las variables se leen **en el momento del build**, no en vivo. Cargarlas
   no reconstruye nada: hay que ir a Deployments → ⋯ → Redeploy, o hacer un push nuevo.
3. **Se cargaron en el entorno equivocado.** En Vercel conviene marcar Production, Preview y
   Development en cada una.
4. **El valor está mal pegado.** La app recorta espacios y comillas sobrantes sola, pero si
   `VITE_FIREBASE_DATABASE_URL` es el enlace de la consola en vez de la URL de la base, la pantalla
   lo marca explícitamente.

Último paso, en cualquiera de las dos: agregar el dominio del sitio en Firebase, en
**Authentication → Settings → Dominios autorizados**. Sin eso, el inicio de sesión anónimo falla.

---

## Firmware

`firmware/oxynet_esp32/oxynet_esp32.ino` es el sketch original con estos arreglos:

1. **`DATABASE_URL` correcta.** El `FIREBASE_HOST` que teníamos era el enlace de la consola web
   (`https://console.firebase.google.com/project/...`), no la URL de la base. Con eso la librería no
   podía conectarse a ningún lado.
2. **Autenticación con usuario y contraseña** en lugar del database secret (ver arriba).
3. **Espera de NTP en el `setup()`.** Antes, si el reloj no había sincronizado, `getUnixTime()`
   devolvía 0 y `ultima_medicion` se escribía con `timestamp: 0`. El historial estaba protegido, pero
   la medición en vivo no.
4. **Reconexión de Wi-Fi.** El `while` del `setup()` original bloqueaba para siempre si la red no
   aparecía, y una caída posterior dejaba al ESP32 mudo hasta un reset manual.
5. **Validación de `energy()`**, que también puede devolver NaN y no estaba contemplada.
6. **`millis()` con resta de unsigned**, que sobrevive al desbordamiento a los ~49 días.

Librerías necesarias, desde el gestor del IDE de Arduino:

- *Firebase ESP32 Client* (Mobizt) ≥ 4.3
- *PZEM004Tv30* (mandulaj) ≥ 1.1

---

## Estructura de los datos

```
/bomba_oxigeno
  /ultima_medicion          <- se sobrescribe en cada envío
      timestamp: 1756209600  (epoch Unix en segundos, UTC)
      tension:   221.4       (V)
      corriente: 7.83        (A)
      potencia:  1421.7      (W)
      cosfi:     0.82
      kwh:       153.72      (acumulado del PZEM)
  /historial
      /1756209600           <- una clave por medición, el epoch en segundos
          v:  221.4
          i:  7.83
          p:  1421.7
          fp: 0.82
```

El panel consulta el historial con `orderByKey()` + `startAt()`, que aprovecha el índice natural de
las claves: no hace falta declarar ningún `.indexOn`.

---

## Dos cosas para tener en cuenta

### El PZEM-004T mide una sola fase

La bomba es trifásica, pero el PZEM-004T v3 es un medidor monofásico: lo que se está midiendo es una
sola fase. De ahí que el panel diga "potencia activa sobre la fase instrumentada", y que la potencia
trifásica figure como **estimada** (3 × la medida, asumiendo carga equilibrada).

Eso alcanza para vigilar consumo y detectar que la bomba arrancó o se trabó, pero **no detecta
desbalance ni falta de fase**, que es justo la falla que más quema motores trifásicos. Si en algún
momento quieren cubrir eso, el camino es poner tres PZEM-004T (uno por fase) sobre el mismo bus
Modbus con direcciones distintas, y publicar `historial/<timestamp>/{L1,L2,L3}`. La app está armada
alrededor de un solo juego de valores, así que habría que ampliarla, pero el modelo de datos y los
gráficos ya están preparados para agregar series.

### El historial crece rápido

A 5 segundos son 17.280 registros por día, unos 1,7 MB diarios y del orden de 600 MB al año. El plan
gratuito de Firebase da 1 GB de almacenamiento y 10 GB de descarga por mes, así que en algún momento
aprieta. Tres formas de manejarlo, de menor a mayor esfuerzo:

1. **Subir el intervalo** a 15 o 30 segundos. Para un motor que arranca y para cada varios minutos,
   5 segundos es mucho más resolución de la que hace falta.
2. **Borrar lo viejo**: una tarea programada (Cloud Function o un script que corra en cualquier lado)
   que elimine los registros de más de 30 días.
3. **Guardar resúmenes por hora** en `/bomba_oxigeno/resumen_horario/<epoch_hora>` con mín, máx y
   promedio de cada variable. Es lo que permitiría ver meses de historial sin descargar todo.

Por eso el rango de 7 días tiene un tope de registros por consulta: si se alcanza, el panel avisa que
está mostrando el tramo más reciente en vez de fingir que tiene la ventana completa.

---

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga en caliente |
| `npm run build` | Chequeo de tipos + build de producción en `dist/` |
| `npm run preview` | Sirve `dist/` para probar el build antes de desplegar |
