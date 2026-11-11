import type { CategoryId, ProtocolId } from '../../core/types';
import { CATEGORY_BADGE, PROTOCOL_COLORS } from '../format';
import { useT } from '../hooks';

/** Protocolo: punto de color + nombre. El texto lleva siempre tinta neutra, nunca el color. */
export function ProtocolBadge({ protocol }: { protocol: ProtocolId }) {
  const { tk } = useT();
  return (
    <span className="chip">
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: PROTOCOL_COLORS[protocol] }}
      />
      {tk('protocol', protocol)}
    </span>
  );
}

export function CategoryBadge({ category }: { category: CategoryId }) {
  const { tk } = useT();
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${CATEGORY_BADGE[category]}`}
    >
      {tk('category', category)}
    </span>
  );
}
