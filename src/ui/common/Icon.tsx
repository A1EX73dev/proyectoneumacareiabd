import type { ReactNode } from 'react';

/** Iconos de línea (24 × 24) dibujados para el panel: no dependen de ninguna librería. */
const PATHS = {
  alert: (
    <>
      <path d="M12 4 21 19.5H3L12 4Z" />
      <path d="M12 10v4.5M12 17.2v.1" />
    </>
  ),
  arrowLeft: <path d="M19 12H5M11 6l-6 6 6 6" />,
  bed: (
    <>
      <path d="M3.5 8.5 8 15h12.5" />
      <path d="M5 18h15.5v-5.5M7.5 18v2M18 18v2" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2.5h-15L6 16Z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  blinds: (
    <>
      <path d="M4 4h16M6 4v15h12V4" />
      <path d="M6 8h12M6 11.5h12M6 15h12" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
  chat: (
    <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-7.5L7 19.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  door: (
    <>
      <path d="M6 20V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v15M3.5 20h17" />
      <path d="M14.5 12.3v.1" />
    </>
  ),
  droplet: <path d="M12 3.5c3 3.4 5.5 6.5 5.5 9.5a5.5 5.5 0 0 1-11 0c0-3 2.5-6.1 5.5-9.5Z" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.6 2.7 2.6 14.3 0 17M12 3.5c-2.6 2.7-2.6 14.3 0 17" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.8v.1" />
    </>
  ),
  list: <path d="M9 7h11M9 12h11M9 17h11M4.5 7h.1M4.5 12h.1M4.5 17h.1" />,
  lock: (
    <>
      <rect x="5.5" y="10.5" width="13" height="9.5" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </>
  ),
  plan: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="1.5" />
      <path d="M4 11h7M11 5v14M11 15h9" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  pulse: <path d="M3 12h4l2.5-6 4 12 2.5-6h5" />,
  send: (
    <>
      <path d="M20 4 3.5 10.5l6.5 3 3 6.5L20 4Z" />
      <path d="M10 13.5 20 4" />
    </>
  ),
  shield: <path d="m12 3 7 2.8v5.4c0 4.4-2.9 8-7 9.8-4.1-1.8-7-5.4-7-9.8V5.8L12 3Z" />,
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="17" r="2" />
    </>
  ),
  sparkles: (
    <>
      <path d="m11 4 1.6 4.4L17 10l-4.4 1.6L11 16l-1.6-4.4L5 10l4.4-1.6L11 4Z" />
      <path d="M18 15v4M16 17h4" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="3.8" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
    </>
  ),
  thermometer: (
    <>
      <path d="M10 13.3V5a2 2 0 0 1 4 0v8.3a4 4 0 1 1-4 0Z" />
      <path d="M12 9v6.5" />
    </>
  ),
  trash: <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />,
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  userPlus: (
    <>
      <circle cx="9.5" cy="8" r="3.5" />
      <path d="M3 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6" />
    </>
  ),
  volume: (
    <>
      <path d="M4 10v4h3l5 4V6l-5 4H4Z" />
      <path d="M16 9.5a3.5 3.5 0 0 1 0 5M18.5 7a7 7 0 0 1 0 10" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6 6 18" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

interface IconProps {
  name: IconName;
  className?: string;
}

/** Icono decorativo: el texto de al lado (o un `aria-label` en el botón) dice lo que es. */
export function Icon({ name, className = 'h-4 w-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      {PATHS[name]}
    </svg>
  );
}
