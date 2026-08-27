/* =============================================================================
 * Oxynet - Monitoreo de la bomba de oxigeno
 * ESP32 + PZEM-004T v3 -> Firebase Realtime Database
 * Firmware 2.0.0
 *
 * Novedades sobre la version 1:
 *   - El Wi-Fi ya no esta escrito a fuego en el codigo. Si el equipo no logra
 *     conectarse, levanta su propia red "Oxynet-Bomba" con un portal cautivo
 *     para configurarlo desde el celular parado al lado, sin desmontarlo.
 *   - Se puede dejar una red preparada desde el panel web. El ESP32 la revisa
 *     cada minuto, la prueba, y si no funciona vuelve solo a la anterior.
 *   - Publica su propio estado (red, senal, IP, MAC, uptime) para que el panel
 *     muestre a que internet esta conectado.
 *
 * Librerias (Gestor de librerias del IDE de Arduino):
 *   - Firebase ESP32 Client (Mobizt)  >= 4.3
 *   - PZEM004Tv30 (mandulaj)          >= 1.1
 *   - WiFiManager (tzapu)             >= 2.0.17
 * ========================================================================== */

#include <WiFi.h>
#include <WiFiManager.h>
#include <Preferences.h>
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
#define VERSION_FIRMWARE "oxynet-esp32 2.1.0"

// Red que levanta el equipo cuando no puede conectarse a ninguna conocida.
#define AP_NOMBRE       "Oxynet-Bomba"
#define AP_CLAVE        "oxynet1234"   // minimo 8 caracteres

const char* ntpServer = "pool.ntp.org";

// =============================================================================
// 2. Pines y objetos
// =============================================================================
#define RXD2 16   // Serial2 RX del ESP32
#define TXD2 17   // Serial2 TX del ESP32

PZEM004Tv30 pzem(Serial2, RXD2, TXD2);
FirebaseData fbDatos;      // para escribir mediciones
FirebaseData fbConfig;     // para leer la red solicitada, en su propia sesion
FirebaseAuth auth;
FirebaseConfig config;
Preferences prefs;

const unsigned long INTERVALO_MEDICION_MS = 5000;    // publicacion de mediciones
const unsigned long INTERVALO_ESTADO_MS   = 60000;   // reporte de estado propio
const unsigned long INTERVALO_WIFI_MS     = 60000;   // revision de red solicitada
const unsigned long ESPERA_PORTAL_S       = 180;     // el portal no bloquea para siempre
const unsigned long ESPERA_CONEXION_MS    = 20000;   // para probar una red nueva

unsigned long ultimaMedicion = 0;
unsigned long ultimoEstado = 0;
unsigned long ultimaRevisionWifi = 0;

// Salud del sensor. Se publica junto al estado para poder distinguir en el panel
// "el ESP32 esta caido" de "el ESP32 anda pero el PZEM no contesta", que son dos
// problemas completamente distintos y antes se veian igual.
bool pzemOk = false;
unsigned long pzemFallasSeguidas = 0;
unsigned long pzemFallasTotales = 0;

// =============================================================================
// 3. Utilidades
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

/**
 * Intenta una red puntual. Devuelve true si engancho antes del timeout.
 * Se usa para probar la red que llego desde el panel, sin perder la actual
 * hasta saber que la nueva anda.
 */
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
 * Conexion de arranque.
 *
 * 1. Si el panel dejo una red pendiente, se prueba primero.
 * 2. Si no anda (o no habia), WiFiManager usa las credenciales guardadas.
 * 3. Si tampoco, levanta el portal cautivo. El portal tiene timeout a proposito:
 *    un equipo que quedo esperando configuracion para siempre es un equipo
 *    muerto si el corte de internet fue pasajero.
 */
void conectarWifi() {
  prefs.begin("oxynet", false);
  String pendienteSsid = prefs.getString("ssid", "");
  String pendienteClave = prefs.getString("clave", "");
  bool hayPendiente = prefs.getBool("pendiente", false);

  if (hayPendiente && pendienteSsid.length() > 0) {
    // Se limpia la marca ANTES de probar: si la red nueva cuelga el equipo y se
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
// 4. Publicaciones
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

  if (!Firebase.setJSON(fbDatos, String(NODO_RAIZ) + "/estado_dispositivo", estado)) {
    Serial.print("Error publicando estado: ");
    Serial.println(fbDatos.errorReason());
  }
}

/**
 * Revisa si el panel dejo una red preparada. La guarda en NVS y reinicia: la
 * secuencia de arranque ya sabe probarla y volver atras sola si no funciona.
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
    // Ya estamos en esa red: se borra el pedido para no repetirlo.
    Firebase.deleteNode(fbConfig, ruta);
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

    // Con el sensor caido no hay medicion que publicar, pero si conviene avisar
    // enseguida: si no, el panel muestra "sin datos" como si el equipo estuviera
    // desconectado, que es justo lo que no esta pasando.
    if (pzemFallasSeguidas == 3) publicarEstado();
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
  }

  // 2. historial: un hijo por timestamp, con claves cortas para gastar menos.
  FirebaseJson punto;
  punto.set("v", tension);
  punto.set("i", corriente);
  punto.set("p", potencia);
  punto.set("fp", cosfi);

  String rutaHistorial = String(NODO_RAIZ) + "/historial/" + String(timestamp);
  if (!Firebase.setJSON(fbDatos, rutaHistorial, punto)) {
    Serial.print("Error en historial: ");
    Serial.println(fbDatos.errorReason());
  }
}

// =============================================================================
// 5. Setup y loop
// =============================================================================
void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== " VERSION_FIRMWARE " ===");

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
  // Con el Wi-Fi caido no tiene sentido hablar con Firebase. WiFiManager dejo
  // las credenciales guardadas, asi que el reintento es barato.
  if (WiFi.status() != WL_CONNECTED) {
    static unsigned long ultimoIntento = 0;
    if (millis() - ultimoIntento > 10000) {
      ultimoIntento = millis();
      Serial.println("Wi-Fi caido, reconectando...");
      WiFi.reconnect();
    }
    return;
  }

  unsigned long ahora = millis();

  if (ahora - ultimaMedicion >= INTERVALO_MEDICION_MS) {
    ultimaMedicion = ahora;
    if (Firebase.ready()) publicarMedicion();
    else Serial.println("Firebase todavia no esta listo (token en tramite).");
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
