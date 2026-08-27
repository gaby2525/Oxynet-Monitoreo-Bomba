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

## Cómo está organizado el panel

Tres secciones, con su propia URL (`#/monitor`, `#/analisis`, `#/configuracion`), así que el botón
"atrás" del navegador funciona y se puede compartir un enlace directo a cualquiera.

### Monitor

Lo que se mira todos los días, sin nada de configuración encima:

- Estado de la bomba (en marcha / detenida, deducido de la potencia activa) y tira de resumen:
  consumo acumulado, potencia trifásica estimada, energía del rango, tiempo en marcha, ciclo de
  trabajo y arranques.
- Cuatro tarjetas con los valores instantáneos, cada una con su estado (normal / atención / fuera
  de rango) y un color propio que se repite en su gráfico.
- Alarmas activas arriba de todo; si hay alguna, la pestaña Monitor muestra un contador.
- Selector de rango y los cuatro gráficos.
- Indicador de señal: avisa cuando hace más de 20 s que no llega una lectura nueva.

### Análisis

**Parámetros del periodo**, que es el cuadro que uno miraría en un informe de consumo:

| Grupo | Qué trae |
|---|---|
| Tensión | media, mínima, máxima, desvío y variación (máx − mín) / media |
| Corriente | media, **media en marcha**, y pico (normalmente el golpe de arranque) |
| Potencia | activa media y máxima, aparente media (VA), reactiva media (var), factor de carga y cos φ medio en marcha |
| Energía | activa (kWh) y aparente (kVAh) |
| Operación | tiempo en marcha y detenida, ciclo de trabajo, arranques, arranques por hora y duración media de cada marcha |

Un par valen la aclaración:

- **Media en marcha** está separada de la media general a propósito. El promedio de corriente
  contando el tiempo detenida da un número que no significa nada; el que se compara con la chapa
  del motor es el otro.
- **Factor de carga** es la potencia media en marcha sobre la máxima. Dice qué tan parejo trabaja
  el motor: un valor bajo significa que casi toda la potencia se va en picos.

Debajo, los mismos gráficos con más aire, la tabla completa y la descarga del informe CSV.

### Configuración

- **Umbrales de alarma**: mínimo y máximo de cada variable. Dejar un campo vacío quita ese límite.
  Los cambios se reflejan al instante en las alarmas, en las líneas punteadas de los gráficos y en
  el CSV. Se guardan en el navegador (`localStorage`), así que valen por dispositivo; los valores
  de fábrica salen de las variables de entorno y **Restablecer** vuelve a ellos.
- **Dispositivo y red**: a qué Wi-Fi está conectado el ESP32, con qué señal, su IP, su MAC, hace
  cuánto está encendido y qué firmware corre. Desde ahí se le puede dejar una red preparada.
- **Apariencia**: tema claro / oscuro / automático, nodo de datos y estado de la sesión.

## El informe CSV

Tres bloques:

1. **Cabecera del periodo**: rango, desde/hasta, registros, energía estimada, tiempo con datos,
   tiempo en marcha, ciclo de trabajo, arranques y potencia media en marcha.
2. **Resumen por variable**: mínimo y máximo con el momento exacto en que ocurrieron, promedio,
   promedio en marcha, desvío, último valor y los límites configurados.
3. **Detalle** registro a registro, con potencia aparente (VA) y reactiva (var) calculadas.

Separador `;` y coma decimal, que es lo que abre Excel en español sin pedir nada.

## Cuánto historial entra en cada rango

El panel descarga los últimos N registros y recorta la ventana en el cliente. Ese tope está
calculado sobre el peor caso —una muestra cada 5 s, que es lo que publica el firmware— para que los
rangos que se usan a diario entren **completos**:

| Rango | Registros que necesita | Tope | Cobertura |
|---|---|---|---|
| 15 min | 180 | 400 | 100 % |
| 1 hora | 720 | 1.000 | 100 % |
| 6 horas | 4.320 | 5.500 | 100 % |
| 24 horas | 17.280 | 20.000 | 100 % |
| 7 días | 120.960 | 30.000 | ~25 % |

Siete días a 5 segundos son casi 121.000 registros: eso no se baja de una consulta, y el panel lo
dice en vez de fingir que tiene la ventana completa. Dos formas de arreglarlo:

1. **Subir el intervalo del firmware** a 15 o 30 segundos (`INTERVALO_MEDICION_MS`). Para un motor
   que arranca cada varios minutos, 5 segundos es mucha más resolución de la necesaria, y a 30 s
   una semana entran 20.160 registros: dentro del tope.
2. **Guardar resúmenes por hora** en `/bomba_oxigeno/resumen_horario/<epoch_hora>` con mín, máx y
   promedio de cada variable. Es lo que permitiría ver meses de historial sin descargar todo. No
   está implementado todavía.

## Modo demostración

Agregando `?demo=1` a la URL, la app genera datos sintéticos. Sirve para ver la interfaz sin el
ESP32 encendido, o para verificar que el deploy quedó bien antes de conectar la base. El aviso trae
un botón para salir, porque la URL se queda pegada fácil en el historial del navegador.

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

### Umbrales de fábrica

Son el punto de partida que ve alguien que abre el panel por primera vez; después cada uno los
edita desde la app. Se configuran por variables de entorno:

| Variable | Por defecto | Qué es |
|---|---|---|
| `VITE_TENSION_NOMINAL` | 220 | Tensión nominal de referencia |
| `VITE_TENSION_MIN` / `VITE_TENSION_MAX` | 198 / 242 | Rango admitido (±10 %) |
| `VITE_CORRIENTE_MAX` | 12 | Corriente máxima admitida, en A |
| `VITE_POTENCIA_MAX` | 2500 | Potencia máxima admitida, en W |
| `VITE_COSFI_MIN` | 0.7 | cos φ mínimo esperado con la bomba en marcha |
| `VITE_POTENCIA_APAGADA` | 15 | Por debajo de estos W se considera la bomba detenida |
| `VITE_DB_ROOT` | `/bomba_oxigeno` | Nodo raíz donde escribe el ESP32 |

**`VITE_CORRIENTE_MAX` conviene ajustarlo a la chapa del motor**: la corriente nominal más un margen
del 10-15 %, no un número inventado. Lo mismo con `VITE_POTENCIA_MAX`.

Una variable cargada pero vacía cuenta como ausente y cae al valor por defecto.

## Reglas de la base

En `firebase/` hay dos variantes:

- **`database.rules.json`** (recomendada): lectura solo con sesión iniciada, escritura solo para el
  UID del ESP32, y validación de tipos y rangos en cada campo. Para que el panel pueda leer hay que
  habilitar **Authentication → Sign-in method → Anónimo**; la app inicia sesión anónima sola.
- **`database.rules.lectura-publica.json`**: más simple, deja el historial legible por cualquiera que
  conozca la URL. Solo si no importa que los datos sean públicos.

En las dos hay que reemplazar `UID_DEL_ESP32` por el UID real, que se ve en
**Authentication → Users**.

Sobre el nodo `wifi_solicitado`, donde el panel deja la red preparada: las reglas permiten
**escribirlo pero no leerlo**, salvo al UID del ESP32. Así la clave del Wi-Fi no se recupera desde el
panel ni desde la consola de nadie que entre a mirar, y el dispositivo la borra apenas la copia a su
memoria. Aun así, cualquiera con acceso al panel puede reemplazar la red del equipo — si eso
molesta, sacá el bloque `wifi_solicitado` de las reglas y el formulario deja de funcionar.

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

`firmware/oxynet_esp32/oxynet_esp32.ino`, versión 2.0.0.

### Qué se arregló del sketch original

1. **`DATABASE_URL` correcta.** El `FIREBASE_HOST` que teníamos era el enlace de la consola web
   (`https://console.firebase.google.com/project/...`), no la URL de la base. Con eso la librería no
   podía conectarse a ningún lado, y por eso la base nunca recibió un dato.
2. **Autenticación con usuario y contraseña** en lugar del database secret.
3. **Espera de NTP en el `setup()`.** Antes, si el reloj no había sincronizado, `getUnixTime()`
   devolvía 0 y `ultima_medicion` se escribía con `timestamp: 0`.
4. **Reconexión de Wi-Fi.** El `while` del `setup()` original bloqueaba para siempre si la red no
   aparecía, y una caída posterior dejaba al ESP32 mudo hasta un reset manual.
5. **Validación de `energy()`**, que también puede devolver NaN.
6. **`millis()` con resta de unsigned**, que sobrevive al desbordamiento a los ~49 días.

### Wi-Fi sin tocar el código

El SSID y la clave ya no están escritos en el sketch. El arranque hace esto, en orden:

1. Si el panel dejó una red preparada, la prueba primero (20 s de gracia).
2. Si no anda, usa las credenciales que ya tenía guardadas.
3. Si tampoco, levanta la red **`Oxynet-Bomba`** (clave `oxynet1234`) con un portal cautivo: te
   conectás desde el celular, elegís la red y listo.

El portal tiene un timeout de 3 minutos a propósito. Un equipo esperando configuración para siempre
es un equipo muerto si el corte de internet era pasajero; con timeout, vuelve a intentar solo.

El cambio pedido desde el panel se guarda en la memoria del ESP32 y se reinicia. La marca de
"pendiente" se borra **antes** de probar la red nueva, así un SSID que cuelgue el equipo no lo deja
en un bucle de reinicios: al segundo arranque ya cae a la red anterior.

### Si el ESP32 no manda datos

Antes de tocar nada, mirá el `timestamp` de `ultima_medicion` en la consola de Firebase. Es epoch en
segundos: si es reciente, el ESP32 está llegando a la base y el problema está en otro lado.

**El panel distingue dos fallas que se parecen pero no son la misma:**

| Lo que muestra | Qué pasa |
|---|---|
| "Hace más de 120 s que no llega una lectura" | El ESP32 no se está reportando: energía, Wi-Fi o Firebase |
| "El ESP32 está conectado pero el PZEM-004T no responde" | El equipo está bien; el que falla es el sensor |

El firmware publica la salud del sensor en `estado_dispositivo.pzem_ok`, así que esa distinción sale
del propio dispositivo y no de una suposición.

### Probar el PZEM-004T aislado

`firmware/prueba_pzem/prueba_pzem.ino` lee el sensor **sin Wi-Fi ni Firebase**. Si ahí las lecturas
salen bien, el sensor está sano y el problema está en otra parte; si fallan, no tiene sentido tocar
nada de Firebase.

Los tres síntomas y qué significan:

- **`SIN RESPUESTA del modulo`** — no hay comunicación Modbus. Casi siempre es una de estas: el lado
  TTL alimentado con 3,3 V en vez de 5 V, falta de GND común entre el ESP32 y el PZEM, RX/TX
  cruzados al revés (GPIO16 va al **TX** del PZEM, GPIO17 al **RX**), o un Dupont flojo.
- **Tensión correcta pero corriente en 0** — el módulo habla bien; la que no mide es la pinza.
  Revisar que esté cerrada del todo (tiene que hacer clic), que abrace **un solo conductor** (si
  toma fase y neutro juntos las corrientes se cancelan y siempre da 0), y que su conector esté
  enchufado al módulo. Con la bomba parada, 0 A es lo correcto.
- **`rst:0x1 (POWERON_RESET)` en el arranque** — el ESP32 se reinició por corte de alimentación, no
  por software. Suele ser una fuente que no da abasto, y una fuente que se cae también hace que el
  PZEM deje de contestar. Alimentar el ESP32 y el PZEM con una fuente de 5 V que dé al menos 1 A.

### Configuración

Cinco líneas arriba de todo del sketch:

```cpp
#define DATABASE_URL    "https://oxynet-monitoreo-bomba-default-rtdb.firebaseio.com"
#define API_KEY         "la misma AIza... que va en Vercel"
#define USER_EMAIL      "esp32-bomba@oxynet.local"
#define USER_PASSWORD   "la clave del usuario del dispositivo"
#define NODO_RAIZ       "/bomba_oxigeno"
```

Librerías, desde el gestor del IDE de Arduino:

- *Firebase ESP32 Client* (Mobizt) ≥ 4.3
- *PZEM004Tv30* (mandulaj) ≥ 1.1
- *WiFiManager* (tzapu) ≥ 2.0.17

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
  /estado_dispositivo       <- el ESP32 se describe a sí mismo, cada minuto
      ssid: "Oxynet-Taller"
      rssi: -58              (dBm)
      ip:   "192.168.1.47"
      mac:  "A0:B7:65:2C:11:9E"
      uptime_s: 69300
      firmware: "oxynet-esp32 2.0.0"
      intervalo_ms: 5000
      timestamp: 1756209600
  /wifi_solicitado          <- lo escribe el panel; solo el ESP32 puede leerlo
      ssid:  "Red-Nueva"
      clave: "..."
      solicitado_en: 1756209600000
```

El panel pide los últimos N registros con `orderByKey()` + `limitToLast()` y recorta la ventana en
el cliente. Se evitó `startAt()` a propósito: las claves son el epoch en segundos, que la Realtime
Database indexa como enteros, y el filtro por clave no se comportaba de forma predecible. Filtrar en
el cliente cuesta lo mismo en descarga y es exacto. No hace falta declarar ningún `.indexOn`.

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
aprieta — y además es lo que limita el rango de 7 días (ver más arriba).

Tres formas de manejarlo, de menor a mayor esfuerzo:

1. **Subir el intervalo** a 15 o 30 segundos, en `INTERVALO_MEDICION_MS` del firmware. Es el cambio
   de una línea y resuelve las dos cosas a la vez.
2. **Borrar lo viejo**: una tarea programada (Cloud Function o un script que corra en cualquier
   lado) que elimine los registros de más de 30 días.
3. **Guardar resúmenes por hora**, como se describe arriba.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga en caliente |
| `npm run build` | Chequeo de tipos + build de producción en `dist/` |
| `npm run preview` | Sirve `dist/` para probar el build antes de desplegar |

---

## Sobre los colores

Los cuatro tonos de las series (teal, ámbar, azul, magenta) no se eligieron a ojo. Se buscaron por
fuerza bruta sobre el espacio OKLCH y se validaron contra las dos superficies reales de la app:

- Todos los pares se distinguen bajo protanopía y deuteranopía (peor par ΔE 8.1 en claro, 8.1 en
  oscuro; el objetivo es 8).
- Todos superan 3:1 de contraste contra su fondo, en claro y en oscuro — sin depender de la
  excepción de "poner etiquetas visibles".
- La versión oscura no es un volteo automático de la clara: son tonos re-escalonados para el fondo
  oscuro y validados como conjunto aparte.

Los colores de estado (verde/ámbar/naranja/rojo) están reservados para eso y nunca se usan como
color de serie. Van siempre con ícono y texto, así que ninguno depende del color solo.

Si cambiás un hex de `src/styles.css`, volvé a correr esa validación antes de darlo por bueno.
