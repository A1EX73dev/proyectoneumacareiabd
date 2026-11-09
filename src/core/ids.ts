let counter = 0;

/** Identificador único en memoria (no criptográfico, suficiente para la simulación). */
export function newId(prefix = 'id'): string {
  counter += 1;
  return `${prefix}-${counter.toString(36)}`;
}
