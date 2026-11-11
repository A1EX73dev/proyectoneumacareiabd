import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

interface CardProps {
  title: string;
  titleId: string;
  /** Icono pequeño junto al título. */
  icon?: IconName;
  /** Línea de apoyo bajo el título. */
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Sin relleno interior (para tablas o lienzos a sangre). */
  flush?: boolean;
}

/** Contenedor de sección con encabezado accesible. */
export function Card({
  title,
  titleId,
  icon,
  subtitle,
  actions,
  children,
  className = '',
  flush = false,
}: CardProps) {
  return (
    <section
      aria-labelledby={titleId}
      className={`rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-8px_rgba(15,23,42,0.08)] ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-100 px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon && (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Icon name={icon} />
            </span>
          )}
          <div className="min-w-0">
            <h2 id={titleId} className="text-[15px] font-semibold leading-5 text-slate-900">
              {title}
            </h2>
            {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
          </div>
        </div>
        {actions}
      </div>
      <div className={flush ? '' : 'p-5'}>{children}</div>
    </section>
  );
}
