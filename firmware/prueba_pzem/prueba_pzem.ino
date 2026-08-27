/* =============================================================================
 * Oxynet - Prueba y busqueda de pines del PZEM-004T
 *
 * Sin Wi-Fi ni Firebase: aisla el sensor del resto del sistema.
 *
 * En el ESP32 el UART2 no esta atado a los pines 16/17: la matriz de GPIO deja
 * mapearlo a casi cualquier pin. Por eso este sketch, si no logra hablar con el
 * modulo, prueba una lista de combinaciones —incluidas las dos orientaciones de
 * RX/TX— y te dice cual funciona.
 *
 * Cargar, abrir el Monitor Serie a 115200 baudios y esperar.
 *
 * Libreria necesaria: PZEM004Tv30 (mandulaj) >= 1.1
 * ========================================================================== */

#include <PZEM004Tv30.h>

// Si ya sabes que pines usar, ponelos aca y el sketch saltea la busqueda.
// Dejar en -1 para que los busque solo.
#define FORZAR_RX -1
#define FORZAR_TX -1

/**
 * Combinaciones a probar, en orden. Cada par va en las dos orientaciones,
 * porque cruzar RX con TX es el error mas comun y desde afuera se ve igual que
 * un modulo muerto.
 *
 * Quedan afuera a proposito:
 *   - GPIO 6 a 11: van a la memoria flash, usarlos cuelga la placa.
 *   - GPIO 16 y 17 en modulos WROVER: los ocupa la PSRAM. Se prueban igual
 *     porque en los WROOM son los clasicos, pero si tu placa tiene PSRAM van a
 *     fallar siempre y hay que usar otro par.
 *   - GPIO 34 a 39: son solo entrada, no pueden hacer de TX.
 */
struct Combinacion { int8_t rx; int8_t tx; };

const Combinacion COMBINACIONES[] = {
  { 16, 17 }, { 17, 16 },
  { 25, 26 }, { 26, 25 },
  { 32, 33 }, { 33, 32 },
  { 27, 14 }, { 14, 27 },
  { 18, 19 }, { 19, 18 },
  { 22, 23 }, { 23, 22 },
  {  4,  5 }, {  5,  4 },
  { 13, 15 }, { 15, 13 },
};
const size_t CANTIDAD = sizeof(COMBINACIONES) / sizeof(COMBINACIONES[0]);

int8_t pinRx = -1;
int8_t pinTx = -1;
unsigned long lecturas = 0;

/** Devuelve true si en esos pines hay un PZEM que contesta. */
bool responde(int8_t rx, int8_t tx) {
  Serial2.end();
  delay(60);
  PZEM004Tv30 candidato(Serial2, rx, tx);
  // Dos intentos: el primero suele perderse mientras el modulo se despierta.
  for (int intento = 0; intento < 2; intento++) {
    delay(350);
    if (!isnan(candidato.voltage())) return true;
  }
  return false;
}

void buscarPines() {
  Serial.println("Buscando el modulo en las combinaciones conocidas...");
  Serial.println("(RX del ESP32 va al TX del PZEM, y TX del ESP32 al RX del PZEM)");
  Serial.println();

  for (size_t k = 0; k < CANTIDAD; k++) {
    const Combinacion& c = COMBINACIONES[k];
    Serial.printf("  RX=GPIO%-2d TX=GPIO%-2d ... ", c.rx, c.tx);
    if (responde(c.rx, c.tx)) {
      Serial.println("CONTESTA");
      pinRx = c.rx;
      pinTx = c.tx;
      return;
    }
    Serial.println("nada");
  }
}

void setup() {
  Serial.begin(115200);
  delay(600);
  Serial.println();
  Serial.println("=== Prueba del PZEM-004T ===");
  Serial.println();

  if (FORZAR_RX >= 0 && FORZAR_TX >= 0) {
    pinRx = FORZAR_RX;
    pinTx = FORZAR_TX;
    Serial.printf("Pines forzados: RX=GPIO%d TX=GPIO%d\n\n", pinRx, pinTx);
  } else {
    buscarPines();
  }

  Serial.println();
  if (pinRx < 0) {
    Serial.println("NINGUNA COMBINACION CONTESTO.");
    Serial.println();
    Serial.println("Con todos los pines descartados, lo que queda es alimentacion o cableado:");
    Serial.println("  1. El lado TTL del PZEM necesita 5 V. Con los 3,3 V del ESP32 a veces");
    Serial.println("     arranca y a veces no, y es un sintoma identico a este.");
    Serial.println("  2. Tiene que haber GND comun entre el ESP32 y el PZEM.");
    Serial.println("  3. El lado de AC del modulo tiene que tener tension: la parte de");
    Serial.println("     medicion se alimenta de la linea que mide.");
    Serial.println("  4. Revisar que los Dupont hagan contacto; son la falla mas boba y comun.");
    Serial.println();
    Serial.println("Si tu placa tiene PSRAM (modulos WROVER), los GPIO 16 y 17 estan ocupados");
    Serial.println("por la memoria y nunca van a funcionar: usar por ejemplo 25 y 26.");
    return;
  }

  Serial.println("======================================================");
  Serial.printf("  MODULO ENCONTRADO EN  RX=GPIO%d  TX=GPIO%d\n", pinRx, pinTx);
  Serial.println("======================================================");
  Serial.println();
  Serial.println("Anotar estos dos numeros y ponerlos en el firmware principal:");
  Serial.printf("    #define RXD2 %d\n", pinRx);
  Serial.printf("    #define TXD2 %d\n", pinTx);
  Serial.println();
}

void loop() {
  if (pinRx < 0) {
    delay(5000);
    return;
  }

  static PZEM004Tv30 pzem(Serial2, pinRx, pinTx);
  lecturas++;

  float tension    = pzem.voltage();
  float corriente  = pzem.current();
  float potencia   = pzem.power();
  float energia    = pzem.energy();
  float frecuencia = pzem.frequency();
  float cosfi      = pzem.pf();

  if (isnan(tension)) {
    Serial.printf("[%lu] Se perdio la comunicacion. Si pasa cada tanto, mirar la fuente:\n", lecturas);
    Serial.println("      un ESP32 que se reinicia solo tambien deja al PZEM sin contestar.");
  } else {
    Serial.printf("[%lu] %6.1f V | %6.2f A | %8.1f W | %5.2f cos | %6.2f Hz | %8.3f kWh\n",
                  lecturas, tension, corriente, potencia, cosfi, frecuencia, energia);

    // La tension llega pero la corriente da cero: el modulo habla bien, lo que
    // no esta midiendo es la pinza. Es un sintoma distinto y conviene separarlo.
    if (corriente == 0.0f) {
      Serial.println("      Corriente en 0. Si la bomba esta andando, revisar:");
      Serial.println("      - Que la pinza este CERRADA (que haya hecho clic).");
      Serial.println("      - Que abrace UN SOLO conductor. Si toma fase y neutro");
      Serial.println("        juntos, las corrientes se cancelan y siempre da 0.");
      Serial.println("      - Que el conector de la pinza este enchufado al modulo.");
    }
  }

  // El PZEM-004T v3 necesita su tiempo entre consultas Modbus; con menos de
  // ~200 ms empieza a no contestar aunque este todo bien conectado.
  delay(2000);
}
