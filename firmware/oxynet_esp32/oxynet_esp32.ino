/* =============================================================================
 * Oxynet - Monitoreo de la bomba de oxigeno
 * ESP32 + PZEM-004T v3 -> Firebase Realtime Database
 *
 * Diferencias respecto del sketch original:
 *   1. FIREBASE_HOST apuntaba al enlace de la consola web. La libreria necesita
 *      la URL de la base (la que termina en .firebaseio.com o
 *      .firebasedatabase.app), que es otra cosa.
 *   2. Se reemplaza el "database secret" heredado por autenticacion con
 *      usuario/contrasena. El secreto es equivalente a una clave de
 *      administrador: quien lo tiene puede leer y borrar toda la base.
 *   3. Se espera a que sincronice el NTP antes de publicar. Antes se podia
 *      escribir 'ultima_medicion' con timestamp 0.
 *   4. Se reconecta el Wi-Fi si se cae, en vez de quedar mudo hasta un reset.
 *   5. Se valida tambien la lectura de energia (kWh), que puede venir NaN.
 *
 * Librerias (Gestor de librerias del IDE de Arduino):
 *   - Firebase ESP32 Client (Mobizt)  >= 4.3
 *   - PZEM004Tv30 (mandulaj)          >= 1.1
 * ========================================================================== */

#include <WiFi.h>
#include <FirebaseESP32.h>
#include <addons/TokenHelper.h>
#include <PZEM004Tv30.h>
#include "time.h"

// =============================================================================
// 1. Red y Firebase
// =============================================================================
#define WIFI_SSID       "NOMBRE_DE_TU_WIFI"
#define WIFI_PASSWORD   "CLAVE_DE_TU_WIFI"

// Consola de Firebase -> Realtime Database: la URL que figura arriba de la tabla.
#define DATABASE_URL    "https://oxynet-monitoreo-bomba-default-rtdb.firebaseio.com"

// Consola de Firebase -> Configuracion del proyecto -> General -> "Clave de API web".
#define API_KEY         "PEGAR_LA_WEB_API_KEY"

// Usuario creado en Authentication -> Users, solo para este dispositivo.
#define USER_EMAIL      "esp32-bomba@oxynet.local"
#define USER_PASSWORD   "PEGAR_LA_CLAVE_DEL_USUARIO"

#define NODO_RAIZ       "/bomba_oxigeno"

const char* ntpServer = "pool.ntp.org";

// =============================================================================
// 2. Pines y objetos
// =============================================================================
#define RXD2 16   // Serial2 RX del ESP32
#define TXD2 17   // Serial2 TX del ESP32

PZEM004Tv30 pzem(Serial2, RXD2, TXD2);
FirebaseData firebaseData;
FirebaseAuth auth;
FirebaseConfig config;

const unsigned long INTERVALO_MS = 5000;   // periodo de publicacion
unsigned long ultimoEnvio = 0;
unsigned long ultimoIntentoWifi = 0;

// =============================================================================
// 3. Utilidades
// =============================================================================

// Devuelve el epoch Unix en segundos, o 0 si el reloj todavia no sincronizo.
unsigned long obtenerEpoch() {
  time_t ahora;
  time(&ahora);
  // Antes de sincronizar con NTP el reloj arranca en 1970; 2020-01-01 sirve de corte.
  return (ahora > 1577836800UL) ? (unsigned long)ahora : 0UL;
}

void conectarWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Conectando a Wi-Fi");
  unsigned long inicio = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - inicio < 30000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(WiFi.status() == WL_CONNECTED ? "\nWi-Fi conectado." : "\nNo se pudo conectar.");
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
// 4. Setup
// =============================================================================
void setup() {
  Serial.begin(115200);

  conectarWifi();
  esperarNtp();

  config.database_url = DATABASE_URL;
  config.api_key = API_KEY;
  auth.user.email = USER_EMAIL;
  auth.user.password = USER_PASSWORD;
  config.token_status_callback = tokenStatusCallback;   // viene de TokenHelper.h

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
  firebaseData.setBSSLBufferSize(2048, 1024);

  Serial.println("Sistema listo para monitoreo.");
}

// =============================================================================
// 5. Loop
// =============================================================================
void loop() {
  // Reconexion de Wi-Fi sin bloquear el resto del loop.
  if (WiFi.status() != WL_CONNECTED && millis() - ultimoIntentoWifi > 10000) {
    ultimoIntentoWifi = millis();
    Serial.println("Wi-Fi caido, reconectando...");
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    return;
  }

  if (millis() - ultimoEnvio < INTERVALO_MS) return;
  ultimoEnvio = millis();

  if (!Firebase.ready()) {
    Serial.println("Firebase todavia no esta listo (token en tramite).");
    return;
  }

  float tension   = pzem.voltage();
  float corriente = pzem.current();
  float potencia  = pzem.power();
  float cosfi     = pzem.pf();
  float energia   = pzem.energy();

  if (isnan(tension) || isnan(corriente) || isnan(potencia) || isnan(cosfi) || isnan(energia)) {
    Serial.println("Error al leer el PZEM-004T (revisar cableado de Serial2 y alimentacion).");
    return;
  }

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

  if (Firebase.setJSON(firebaseData, String(NODO_RAIZ) + "/ultima_medicion", ultima)) {
    Serial.println("-> ultima_medicion actualizada.");
  } else {
    Serial.print("Error en ultima_medicion: ");
    Serial.println(firebaseData.errorReason());
  }

  // 2. historial: un hijo por timestamp, con claves cortas para gastar menos.
  FirebaseJson punto;
  punto.set("v", tension);
  punto.set("i", corriente);
  punto.set("p", potencia);
  punto.set("fp", cosfi);

  String rutaHistorial = String(NODO_RAIZ) + "/historial/" + String(timestamp);
  if (Firebase.setJSON(firebaseData, rutaHistorial, punto)) {
    Serial.println("-> Registro guardado en historial.");
  } else {
    Serial.print("Error en historial: ");
    Serial.println(firebaseData.errorReason());
  }
}
