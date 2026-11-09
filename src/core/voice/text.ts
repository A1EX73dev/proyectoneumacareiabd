/** Normalización de texto y conversión de números escritos en palabras (castellano). */

const UNITS: Record<string, number> = {
  cero: 0,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
};

const TEENS_AND_TWENTIES: Record<string, number> = {
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiuno: 21,
  veintiun: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
};

const TENS: Record<string, number> = {
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
};

const HUNDREDS: Record<string, number> = {
  cien: 100,
  ciento: 100,
  doscientos: 200,
  doscientas: 200,
  trescientos: 300,
  cuatrocientos: 400,
  quinientos: 500,
  seiscientos: 600,
  setecientos: 700,
  ochocientos: 800,
  novecientos: 900,
};

const MILLE = 'mil';

function parseBelowThousand(
  tokens: string[],
  start: number,
): { value: number; next: number } | null {
  let i = start;
  let value = 0;
  let matched = false;
  const h = HUNDREDS[tokens[i] ?? ''];
  if (h !== undefined) {
    value += h;
    i += 1;
    matched = true;
  }
  const tens = TENS[tokens[i] ?? ''];
  const teen = TEENS_AND_TWENTIES[tokens[i] ?? ''];
  const unit = UNITS[tokens[i] ?? ''];
  if (tens !== undefined) {
    value += tens;
    i += 1;
    matched = true;
    const after = UNITS[tokens[i + 1] ?? ''];
    if (tokens[i] === 'y' && after !== undefined && after > 0) {
      value += after;
      i += 2;
    }
  } else if (teen !== undefined) {
    value += teen;
    i += 1;
    matched = true;
  } else if (unit !== undefined) {
    value += unit;
    i += 1;
    matched = true;
  }
  return matched ? { value, next: i } : null;
}

/** Sustituye secuencias de números en palabras por cifras: "doscientos cinco" → "205". */
export function wordsToNumbers(text: string): string {
  const tokens = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    // "por ciento" es una expresión, no el número 100.
    if (tokens[i] === 'ciento' && tokens[i - 1] === 'por') {
      out.push('ciento');
      i += 1;
      continue;
    }
    let parsed = parseBelowThousand(tokens, i);
    if (tokens[i] === MILLE) parsed = { value: 1, next: i };
    if (!parsed) {
      out.push(tokens[i] ?? '');
      i += 1;
      continue;
    }
    let value = parsed.value;
    let next = parsed.next;
    if (tokens[next] === MILLE) {
      value = (value || 1) * 1000;
      next += 1;
      const rest = parseBelowThousand(tokens, next);
      if (rest) {
        value += rest.value;
        next = rest.next;
      }
    }
    out.push(String(value));
    i = next;
  }
  return out.join(' ');
}

/** Minúsculas, sin tildes, "%" → "por ciento", sin puntuación (salvo ":" de las horas) y números en cifras. */
export function normalize(text: string): string {
  const base = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/(\d)\s*%/g, '$1 por ciento')
    .replace(/%/g, ' por ciento')
    .replace(/[º°]/g, ' ')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[¿?¡!,;"'()]/g, ' ')
    .replace(/[.:](?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return wordsToNumbers(base);
}
