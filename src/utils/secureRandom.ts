/**
 * Generador de números aleatorios criptográficamente seguro (CSPRNG).
 * Sustituye a Math.random() usando la Web Crypto API — la misma fuente
 * de entropía que usa el sistema operativo para generar claves criptográficas.
 * Uso idéntico a Math.random(): devuelve un float en [0, 1).
 */
export function secureRandom(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 0x100000000; // 2^32
}
