/* =============================================================================
 * Oxynet - Monitoreo de la bomba de oxigeno
 * ESP32 + PZEM-004T v3 -> Firebase Realtime Database
 * Firmware 2.2.0
 *
 * Mantiene el buffer en Flash (si se cae el Wi-Fi, las mediciones se guardan y
 * se suben cuando vuelve) y le suma:
 *   - Senal de vida aunque el PZEM no conteste, para poder distinguir en el
 *     panel "el equipo esta caido" de "el sensor no responde".
 *   - Autenticacion con usuario y contrasena en lugar del database secret.
 *   - Espera de NTP antes de publicar, y chequeo del resultado de cada escritura.
 *   - Wi-Fi configurable sin recompilar: portal cautivo y cambio desde el panel.
 *   - Subida del buffer por lotes, para no bloquear el loop varios minutos.
 *
 * Librerias (Gestor de librerias del IDE de Arduino):
 *   - Firebase ESP32 Client (Mobizt)  >= 4.3
 *   - PZEM004Tv30 (mandulaj)          >= 1.1
 *   - WiFiManager (tzapu)             >= 2.0.17
 * ========================================================================== */

#include <WiFi.h>
#include <WiFiManager.h>
#include <Preferences.h>
#include <LittleFS.h>
#include <FirebaseESP32.h>
#include <addons/TokenHelper.h>
#include <PZEM004Tv30.h>
#include "time.h"

// =============================================================================
// 1. Configuracion
// =============================================================================

// Consola de Firebase -> Realtime Database: la URL que figura arriba de la tabla.
#define DATABASE_URL    "https://oxynet-monitoreo-bomba-default-rtdb.firebaseio.com"

// Consola de Firebase -> Configuracion del proyecto -> General -> "Clave de API web".
#define API_KEY         "PEGAR_LA_WEB_API_KEY"

// Usuario creado en Authentication -> Users, solo para este dispositivo.
#define USER_EMAIL      "esp32-bomba@oxynet.local"
#define USER_PASSWORD   "PEGAR_LA_CLAVE_DEL_USUARIO"

#define NODO_RAIZ       "/bomba_oxigeno"
#define VERSION_FIRMWARE "oxynet-esp32 2.2.0"

/*
 * Red de respaldo, opcional. Se usa solo si el equipo no tiene ninguna red
 * guardada en su memoria (por ejemplo la primera vez que se programa). Dejar
 * las dos cadenas vacias para depender unicamente del portal cautivo.
 */
#define WIFI_SSID_RESPALDO     ""
#define WIFI_PASSWORD_RESPALDO ""

// Red que levanta el equipo cuando no puede conectarse a ninguna conocida.
#define AP_NOMBRE       "Oxynet-Bomba"
#define AP_CLAVE        "oxynet1234"   // minimo 8 caracteres

const char* ntpServer = "pool.ntp.org";

/*
 * Pines del UART2 hacia el PZEM-004T.
 *
 * En el ESP32 el UART2 no esta atado a ningun pin fijo: la matriz de GPIO lo
 * mapea a casi cualquiera. Si el modulo no contesta, correr el sketch
 * `firmware/prueba_pzem`, que busca la combinacion que funciona y la imprime.
 *
 * RX va cruzado: RXD2 del ESP32 al TX del PZEM, y TXD2 al RX del PZEM.
 * En modulos WROVER los GPIO 16 y 17 los ocupa la PSRAM y no sirven.
 */
#define RXD2 18   // Serial2 RX del ESP32  <- TX del PZEM
#define TXD2 19   // Serial2 TX del ESP32  -> RX del PZEM

// =============================================================================
// 2. Objetos y estado
// =============================================================================
PZEM004Tv30 pzem(Serial2, RXD2, TXD2);
FirebaseData fbDatos;      // escritura de mediciones
FirebaseData fbConfig;     // lectura de la red solicitada, en su propia sesion
FirebaseAuth auth;
FirebaseConfig config;
Preferences prefs;

const unsigned long INTERVALO_MEDICION_MS = 5000;
const unsigned long INTERVALO_ESTADO_MS   = 60000;
const unsigned long INTERVALO_WIFI_MS     = 60000;
const unsigned long ESPERA_PORTAL_S       = 180;
const unsigned long ESPERA_CONEXION_MS    = 20000;

#define ARCHIVO_BUFFER  "/offline_data.txt"
// Cuantos registros pendientes se suben por pasada. Subir todo de una dejaba el
// loop bloqueado varios minutos tras una caida larga, y con eso se perdian
// mediciones nuevas y saltaba el watchdog.
const int LOTE_SUBIDA = 25;
// Tope del buffer. A 5 s son unas 14 horas; pasado eso se descarta lo mas viejo.
const size_t MAX_BUFFER_BYTES = 300 * 1024;

unsigned long ultimaMedicion = 0;
unsigned long ultimoEstado = 0;
unsigned long ultimaRevisionWifi = 0;
unsigned long ultimoIntentoWifi = 0;

bool pzemOk = false;
unsigned long pzemFallasSeguidas = 0;
unsigned long pzemFallasTotales = 0;
unsigned long registrosPendientes = 0;

// =============================================================================
// 3. Tiempo
// =============================================================================

// Epoch Unix en segundos, o 0 si el reloj todavia no sincronizo.
unsigned long obtenerEpoch() {
  time_t ahora;
  time(&ahora);
  // Antes de sincronizar con NTP el reloj arranca en 1970; 2020-01-01 corta bien.
  return (ahora > 1577836800UL) ? (unsigned long)ahora : 0UL;
}

void esperarNtp() {
  configTime(0, 0, ntpServer);   // se guarda en UTC; la interfaz lo pasa a hora local
  Serial.print("Sincronizando hora");
  unsigned long inicio = millis();
  while (obtenerEpoch() == 0 && millis() - inicio < 20000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(obtenerEpoch() ? "\nHora sincronizada." : "\nSin NTP: se reintenta en el loop.");
}

// =============================================================================
// 4. Buffer en Flash
// =============================================================================

void contarPendientes() {
  registrosPendientes = 0;
  if (!LittleFS.exists(ARCHIVO_BUFFER)) return;
  File f = LittleFS.open(ARCHIVO_BUFFER, FILE_READ);
  if (!f) return;
  while (f.available()) {
    if (f.read() == '\n') registrosPendientes++;
  }
  f.close();
}

/** Si el buffer crecio demasiado, descarta la mitad mas vieja. */
void recortarBuffer() {
  File f = LittleFS.open(ARCHIVO_BUFFER, FILE_READ);
  if (!f) return;
  if (f.size() <= MAX_BUFFER_BYTES) {
    f.close();
    return;
  }

  Serial.println("Buffer lleno: se descarta la mitad mas vieja.");
  f.seek(f.size() / 2);
  f.readStringUntil('\n');   // descartar la linea partida al medio

  File tmp = LittleFS.open("/tmp.txt", FILE_WRITE);
  if (!tmp) { f.close(); return; }
  while (f.available()) tmp.write(f.read());
  tmp.close();
  f.close();

  LittleFS.remove(ARCHIVO_BUFFER);
  LittleFS.rename("/tmp.txt", ARCHIVO_BUFFER);
  contarPendientes();
}

void guardarEnFlash(unsigned long ts, float v, float i, float p, float fp) {
  if (ts == 0) return;   // sin hora valida el registro no sirve para el historial

  File f = LittleFS.open(ARCHIVO_BUFFER, FILE_APPEND);
  if (!f) {
    Serial.println("No se pudo abrir el buffer en Flash.");
    return;
  }
  f.printf("%lu,%.2f,%.2f,%.2f,%.2f\n", ts, v, i, p, fp);
  f.close();
  registrosPendientes++;
  Serial.printf("Sin Wi-Fi: guardado en Flash (%lu pendientes).\n", registrosPendientes);
  recortarBuffer();
}

/**
 * Sube hasta LOTE_SUBIDA registros pendientes y deja el resto para la proxima
 * pasada. Devuelve true si quedo algo por subir.
 */
bool subirLoteDelBuffer() {
  if (!LittleFS.exists(ARCHIVO_BUFFER)) return false;

  File f = LittleFS.open(ARCHIVO_BUFFER, FILE_READ);
  if (!f) return false;
  if (f.size() == 0) {
    f.close();
    LittleFS.remove(ARCHIVO_BUFFER);
    registrosPendientes = 0;
    return false;
  }

  int subidos = 0;
  bool falloAlgo = false;

  while (f.available() && subidos < LOTE_SUBIDA && !falloAlgo) {
    String linea = f.readStringUntil('\n');
    linea.trim();
    if (linea.length() == 0) continue;

    unsigned long ts = 0;
    float v = 0, i = 0, p = 0, fp = 0;
    if (sscanf(linea.c_str(), "%lu,%f,%f,%f,%f", &ts, &v, &i, &p, &fp) != 5 || ts == 0) {
      subidos++;   // linea corrupta: se descarta igual, no se reintenta para siempre
      continue;
    }

    FirebaseJson json;
    json.set("v", v);
    json.set("i", i);
    json.set("p", p);
    json.set("fp", fp);

    if (Firebase.setJSON(fbDatos, String(NODO_RAIZ) + "/historial/" + String(ts), json)) {
      subidos++;
    } else {
      // Si falla la red a mitad del lote, se corta y se reintenta despues: lo
      // que quede sin subir tiene que sobrevivir en el archivo.
      Serial.print("Error subiendo pendiente: ");
      Serial.println(fbDatos.errorReason());
      falloAlgo = true;
    }
  }

  // Lo que no se llego a subir se reescribe para la proxima pasada.
  File tmp = LittleFS.open("/tmp.txt", FILE_WRITE);
  if (!tmp) { f.close(); return true; }
  while (f.available()) tmp.write(f.read());
  tmp.close();
  f.close();

  LittleFS.remove(ARCHIVO_BUFFER);
  LittleFS.rename("/tmp.txt", ARCHIVO_BUFFER);
  contarPendientes();

  if (subidos > 0) {
    Serial.printf("Subidos %d pendientes, quedan %lu.\n", subidos, registrosPendientes);
  }
  return registrosPendientes > 0;
}

// =============================================================================
// 5. Wi-Fi
// =============================================================================

bool conectarA(const String& ssid, const String& clave) {
  Serial.printf("Probando la red \"%s\"...\n", ssid.c_str());
  WiFi.disconnect(true);
  delay(200);
  WiFi.begin(ssid.c_str(), clave.c_str());

  unsigned long inicio = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - inicio < ESPERA_CONEXION_MS) {
    delay(400);
    Serial.print(".");
  }
  Serial.println();
  return WiFi.status() == WL_CONNECTED;
}

/**
 * Conexion de arranque, en orden:
 *   1. La red que el panel dejo preparada, si hay.
 *   2. La red de respaldo del sketch, si se configuro y no hay nada guardado.
 *   3. Las credenciales guardadas en la memoria del equipo (WiFiManager).
 *   4. El portal cautivo, con timeout: un equipo esperando configuracion para
 *      siempre es un equipo muerto si el corte de internet era pasajero.
 */
void conectarWifi() {
  prefs.begin("oxynet", false);
  String pendienteSsid = prefs.getString("ssid", "");
  String pendienteClave = prefs.getString("clave", "");
  bool hayPendiente = prefs.getBool("pendiente", false);

  if (hayPendiente && pendienteSsid.length() > 0) {
    // La marca se limpia ANTES de probar: si la red nueva cuelga el equipo y se
    // reinicia, no queremos quedar en un bucle intentando lo mismo.
    prefs.putBool("pendiente", false);
    if (conectarA(pendienteSsid, pendienteClave)) {
      Serial.printf("Conectado a la red nueva: %s\n", WiFi.SSID().c_str());
      prefs.end();
      return;
    }
    Serial.println("La red nueva no respondio; se vuelve a la anterior.");
  }
  prefs.end();

  if (strlen(WIFI_SSID_RESPALDO) > 0 && WiFi.SSID().length() == 0) {
    if (conectarA(WIFI_SSID_RESPALDO, WIFI_PASSWORD_RESPALDO)) {
      Serial.printf("Conectado a la red de respaldo: %s\n", WiFi.SSID().c_str());
      return;
    }
  }

  WiFiManager wm;
  wm.setConfigPortalTimeout(ESPERA_PORTAL_S);
  wm.setConnectTimeout(20);

  if (!wm.autoConnect(AP_NOMBRE, AP_CLAVE)) {
    Serial.println("Sin conexion tras el portal. Se reinicia para reintentar.");
    delay(1000);
    ESP.restart();
  }
  Serial.printf("Wi-Fi conectado a %s (IP %s)\n",
                WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());
}

// =============================================================================
// 6. Publicaciones
// =============================================================================

void publicarEstado() {
  if (!Firebase.ready()) return;

  FirebaseJson estado;
  estado.set("ssid", WiFi.SSID());
  estado.set("rssi", (int)WiFi.RSSI());
  estado.set("ip", WiFi.localIP().toString());
  estado.set("mac", WiFi.macAddress());
  estado.set("uptime_s", (double)(millis() / 1000));
  estado.set("firmware", VERSION_FIRMWARE);
  estado.set("intervalo_ms", (double)INTERVALO_MEDICION_MS);
  estado.set("timestamp", (double)obtenerEpoch());
  estado.set("wifi_aplicado", WiFi.SSID());
  estado.set("pzem_ok", pzemOk);
  estado.set("pzem_fallas", (double)pzemFallasTotales);
  estado.set("pendientes", (double)registrosPendientes);

  if (!Firebase.setJSON(fbDatos, String(NODO_RAIZ) + "/estado_dispositivo", estado)) {
    Serial.print("Error publicando estado: ");
    Serial.println(fbDatos.errorReason());
  }
}

/**
 * Revisa si el panel dejo una red preparada. La guarda en la memoria del equipo
 * y reinicia: la secuencia de arranque ya sabe probarla y volver atras sola.
 */
void revisarWifiSolicitado() {
  if (!Firebase.ready()) return;

  String ruta = String(NODO_RAIZ) + "/wifi_solicitado";
  if (!Firebase.getJSON(fbConfig, ruta)) return;   // no existe: nada que hacer

  FirebaseJson& json = fbConfig.jsonObject();
  FirebaseJsonData campo;

  String nuevoSsid = "";
  String nuevaClave = "";
  if (json.get(campo, "ssid")) nuevoSsid = campo.stringValue;
  if (json.get(campo, "clave")) nuevaClave = campo.stringValue;
  if (nuevoSsid.length() == 0) return;

  if (nuevoSsid == WiFi.SSID()) {
    Firebase.deleteNode(fbConfig, ruta);   // ya estamos ahi: se borra el pedido
    return;
  }

  Serial.printf("El panel pidio cambiar a la red \"%s\". Guardando y reiniciando.\n",
                nuevoSsid.c_str());

  prefs.begin("oxynet", false);
  prefs.putString("ssid", nuevoSsid);
  prefs.putString("clave", nuevaClave);
  prefs.putBool("pendiente", true);
  prefs.end();

  // Se borra el pedido antes de reiniciar: ya quedo copiado en la memoria del
  // equipo, y asi la clave no se queda dando vueltas en la base.
  Firebase.deleteNode(fbConfig, ruta);
  delay(500);
  ESP.restart();
}

void publicarMedicion() {
  float tension   = pzem.voltage();
  float corriente = pzem.current();
  float potencia  = pzem.power();
  float cosfi     = pzem.pf();
  float energia   = pzem.energy();

  if (isnan(tension) || isnan(corriente) || isnan(potencia) || isnan(cosfi) || isnan(energia)) {
    pzemOk = false;
    pzemFallasSeguidas++;
    pzemFallasTotales++;
    Serial.printf("El PZEM-004T no contesta (%lu seguidas). Revisar 5 V del lado TTL, GND comun y RX/TX.\n",
                  pzemFallasSeguidas);

    // Sin medicion no hay nada que publicar, pero SI hay que avisar. El sketch
    // anterior se iba en silencio y desde el panel el equipo parecia muerto,
    // cuando en realidad estaba conectado y el que fallaba era el sensor.
    if (pzemFallasSeguidas == 3 || pzemFallasSeguidas % 60 == 0) publicarEstado();
    return;
  }

  if (!pzemOk) Serial.println("El PZEM-004T volvio a responder.");
  pzemOk = true;
  pzemFallasSeguidas = 0;

  unsigned long timestamp = obtenerEpoch();
  if (timestamp == 0) {
    Serial.println("Sin hora valida todavia; se omite esta publicacion.");
    configTime(0, 0, ntpServer);
    return;
  }

  if (WiFi.status() != WL_CONNECTED || !Firebase.ready()) {
    guardarEnFlash(timestamp, tension, corriente, potencia, cosfi);
    return;
  }

  // 1. ultima_medicion: siempre la misma clave, es lo que lee el panel en vivo.
  FirebaseJson ultima;
  ultima.set("timestamp", (double)timestamp);
  ultima.set("tension", tension);
  ultima.set("corriente", corriente);
  ultima.set("potencia", potencia);
  ultima.set("cosfi", cosfi);
  ultima.set("kwh", energia);

  if (!Firebase.setJSON(fbDatos, String(NODO_RAIZ) + "/ultima_medicion", ultima)) {
    Serial.print("Error en ultima_medicion: ");
    Serial.println(fbDatos.errorReason());
    // La escritura fallo: la medicion se guarda para no perderla.
    guardarEnFlash(timestamp, tension, corriente, potencia, cosfi);
    return;
  }

  // 2. historial: un hijo por timestamp, con claves cortas para gastar menos.
  FirebaseJson punto;
  punto.set("v", tension);
  punto.set("i", corriente);
  punto.set("p", potencia);
  punto.set("fp", cosfi);

  if (!Firebase.setJSON(fbDatos, String(NODO_RAIZ) + "/historial/" + String(timestamp), punto)) {
    Serial.print("Error en historial: ");
    Serial.println(fbDatos.errorReason());
    guardarEnFlash(timestamp, tension, corriente, potencia, cosfi);
  }
}

// =============================================================================
// 7. Setup y loop
// =============================================================================
void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== " VERSION_FIRMWARE " ===");

  if (!LittleFS.begin(true)) Serial.println("No se pudo montar LittleFS: sin buffer offline.");
  else contarPendientes();
  Serial.printf("Registros pendientes en Flash: %lu\n", registrosPendientes);

  conectarWifi();
  esperarNtp();

  config.database_url = DATABASE_URL;
  config.api_key = API_KEY;
  auth.user.email = USER_EMAIL;
  auth.user.password = USER_PASSWORD;
  config.token_status_callback = tokenStatusCallback;   // viene de TokenHelper.h

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
  fbDatos.setBSSLBufferSize(2048, 1024);
  fbConfig.setBSSLBufferSize(2048, 1024);

  Serial.println("Sistema listo para monitoreo.");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    if (millis() - ultimoIntentoWifi > 10000) {
      ultimoIntentoWifi = millis();
      Serial.println("Wi-Fi caido, reconectando...");
      WiFi.reconnect();
    }
    // Sin red se sigue midiendo igual: para eso esta el buffer en Flash.
    if (millis() - ultimaMedicion >= INTERVALO_MEDICION_MS) {
      ultimaMedicion = millis();
      publicarMedicion();
    }
    return;
  }

  unsigned long ahora = millis();

  if (ahora - ultimaMedicion >= INTERVALO_MEDICION_MS) {
    ultimaMedicion = ahora;
    publicarMedicion();
    // Los pendientes van de a lotes chicos, despues de la medicion en vivo:
    // primero lo que esta pasando ahora, despues lo que quedo debiendo.
    if (Firebase.ready() && registrosPendientes > 0) subirLoteDelBuffer();
  }

  if (ahora - ultimoEstado >= INTERVALO_ESTADO_MS) {
    ultimoEstado = ahora;
    publicarEstado();
  }

  if (ahora - ultimaRevisionWifi >= INTERVALO_WIFI_MS) {
    ultimaRevisionWifi = ahora;
    revisarWifiSolicitado();
  }
}
