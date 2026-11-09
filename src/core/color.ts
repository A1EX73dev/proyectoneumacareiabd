/** Utilidades de color puras (sin DOM): Kelvin→RGB, temperatura→color, cielo según la hora. */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const clamp255 = (v: number): number => Math.round(Math.min(255, Math.max(0, v)));

/** Aproximación de Tanner Helland para el color del cuerpo negro. */
export function kelvinToRgb(kelvin: number): Rgb {
  const t = Math.min(40000, Math.max(1000, kelvin)) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  return { r: clamp255(r), g: clamp255(g), b: clamp255(b) };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((c) => clamp255(c).toString(16).padStart(2, '0')).join('')}`;
}

export function hexToRgb(hex: string): Rgb {
  const v = hex.replace('#', '');
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  };
}

export function lerpHex(a: string, b: string, t: number): string {
  const k = Math.min(1, Math.max(0, t));
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex({
    r: ca.r + (cb.r - ca.r) * k,
    g: ca.g + (cb.g - ca.g) * k,
    b: ca.b + (cb.b - ca.b) * k,
  });
}

export function kelvinToHex(kelvin: number): string {
  return rgbToHex(kelvinToRgb(kelvin));
}

/** 18 °C azul → 22 °C blanco → 28 °C rojo. */
export function temperatureToHex(tempC: number): string {
  if (tempC <= 22) return lerpHex('#3b82f6', '#f8fafc', (tempC - 18) / 4);
  return lerpHex('#f8fafc', '#ef4444', (tempC - 22) / 6);
}

/** Luz natural 0–1 según la hora (0 de noche, 1 a mediodía). */
export function daylight(hour: number): number {
  if (hour < 6 || hour > 21) return 0;
  if (hour < 9) return (hour - 6) / 3;
  if (hour > 18) return (21 - hour) / 3;
  return 1;
}

/** Color del cielo visto por la ventana. */
export function skyColor(hour: number): string {
  const night = '#0b1026';
  const dawn = '#fdba74';
  const day = '#93c5fd';
  const dusk = '#f97316';
  if (hour < 5.5 || hour >= 21.5) return night;
  if (hour < 7) return lerpHex(night, dawn, (hour - 5.5) / 1.5);
  if (hour < 9) return lerpHex(dawn, day, (hour - 7) / 2);
  if (hour < 18.5) return day;
  if (hour < 20) return lerpHex(day, dusk, (hour - 18.5) / 1.5);
  return lerpHex(dusk, night, (hour - 20) / 1.5);
}
