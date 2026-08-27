/* =============================================================================
 * Oxynet - Prueba del PZEM-004T, sin Wi-Fi ni Firebase
 *
 * Sirve para aislar el sensor del resto del sistema. Si aca las lecturas salen
 * bien, el problema esta en otro lado; si aca fallan, es cableado, alimentacion
 * o el sensor mismo, y no tiene sentido tocar nada de Firebase.
 *
 * Cargar, abrir el Monitor Serie a 115200 baudios y mirar.
 *
 * Libreria necesaria: PZEM004Tv30 (mandulaj) >= 1.1
 * ========================================================================== */

#include <PZEM004Tv30.h>

#define RXD2 16   // Serial2 RX del ESP32  <- conectar al TX del PZEM
#define TXD2 17   // Serial2 TX del ESP32  -> conectar al RX del PZEM

PZEM004Tv30 pzem(Serial2, RXD2, TXD2);

unsigned long lecturas = 0;
unsigned long fallas = 0;

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println();
  Serial.println("=== Prueba del PZEM-004T ===");
  Serial.printf("Serial2: RX=GPIO%d  TX=GPIO%d\n", RXD2, TXD2);
  Serial.println("Direccion del modulo: 0x" + String(pzem.readAddress(), HEX));
  Serial.println();
  Serial.println("Si la direccion sale 0x0 o 0xFFFF, el modulo no esta contestando:");
  Serial.println("  - Revisar que el lado TTL tenga 5 V (no 3,3 V) y GND comun.");
  Serial.println("  - Revisar que RX y TX no esten cruzados al reves.");
  Serial.println();
}

void loop() {
  lecturas++;

  float tension   = pzem.voltage();
  float corriente = pzem.current();
  float potencia  = pzem.power();
  float energia   = pzem.energy();
  float frecuencia = pzem.frequency();
  float cosfi     = pzem.pf();

  if (isnan(tension)) {
    fallas++;
    Serial.printf("[%lu] SIN RESPUESTA del modulo (fallas: %lu de %lu)\n",
                  lecturas, fallas, lecturas);
    Serial.println("      El PZEM no contesta por Modbus. Es comunicacion o alimentacion,");
    Serial.println("      no tiene nada que ver con la bomba ni con la pinza.");
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
