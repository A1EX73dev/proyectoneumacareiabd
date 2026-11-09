import type { ReactNode } from 'react';

interface CardProps {
  title: string;
  titleId: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Contenedor de sección con encabezado accesible. */
export function Card({ title, titleId, actions, children, className = '' }: CardProps) {
  return (
    <section
      aria-labelledby={titleId}
      className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5">
        <h2 id={titleId} className="text-base font-semibold text-slate-900">
          {title}
        </h2>
        {actions}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
