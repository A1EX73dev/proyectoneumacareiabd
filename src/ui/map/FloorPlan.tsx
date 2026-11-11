import { useState, type KeyboardEvent } from 'react';
import type { Room } from '../../core/types';
import { openRoomView } from '../actions';
import { Card } from '../common/Card';
import { fmtPct, fmtTemp, PROTOCOL_COLORS } from '../format';
import { useApp, useT } from '../hooks';

const ROOM_W = 160;
const ROOM_H = 250;
const LEFT = 150;
const TOP_Y = 20;
const BOTTOM_Y = 370;

interface Slot {
  x: number;
  y: number;
  doorUp: boolean;
}

function slotFor(index: number): Slot {
  const row = index < 5 ? 0 : 1;
  const col = index % 5;
  return { x: LEFT + col * ROOM_W, y: row === 0 ? TOP_Y : BOTTOM_Y, doorUp: row === 1 };
}

/** Mobiliario en coordenadas locales (puerta abajo, ventana arriba). */
function Furniture({ floor }: { floor: string }) {
  return (
    <g>
      <rect x={0} y={0} width={ROOM_W} height={ROOM_H} fill={floor} fillOpacity={0.35} />
      {/* Ventana en la fachada */}
      <line x1={40} y1={0} x2={120} y2={0} stroke="#38bdf8" strokeWidth={7} />
      <line x1={40} y1={0} x2={120} y2={0} stroke="#e0f2fe" strokeWidth={2} />
      {/* Cama con almohada y manta */}
      <rect
        x={20}
        y={18}
        width={55}
        height={95}
        rx={5}
        fill="#ffffff"
        stroke="#475569"
        strokeWidth={1.5}
      />
      <rect x={28} y={24} width={39} height={15} rx={4} fill="#e2e8f0" stroke="#64748b" />
      <rect
        x={20}
        y={62}
        width={55}
        height={51}
        rx={4}
        fill="#bfdbfe"
        stroke="#475569"
        strokeWidth={1.5}
      />
      {/* Mesita */}
      <rect x={82} y={20} width={22} height={22} rx={2} fill="#d6b88f" stroke="#78583a" />
      <circle cx={93} cy={31} r={4} fill="#a78bfa" />
      {/* Sillón */}
      <rect x={116} y={58} width={34} height={34} rx={9} fill="#94a3b8" stroke="#475569" />
      <rect x={121} y={63} width={24} height={20} rx={5} fill="#cbd5e1" />
      {/* Baño con su puerta */}
      <rect x={0} y={168} width={66} height={82} fill="#f1f5f9" stroke="#475569" strokeWidth={2} />
      <rect x={8} y={176} width={18} height={24} rx={8} fill="#ffffff" stroke="#64748b" />
      <rect x={36} y={222} width={22} height={20} rx={3} fill="#ffffff" stroke="#64748b" />
      <path d="M66 176 A 26 26 0 0 1 92 202" fill="none" stroke="#64748b" strokeDasharray="3 3" />
      <line x1={66} y1={176} x2={92} y2={176} stroke="#64748b" strokeWidth={2} />
      {/* Muros */}
      <rect
        x={0}
        y={0}
        width={ROOM_W}
        height={ROOM_H}
        fill="none"
        stroke="#334155"
        strokeWidth={4}
      />
      {/* Hueco y hoja de la puerta de entrada con su arco */}
      <line x1={96} y1={ROOM_H} x2={138} y2={ROOM_H} stroke="#e2e8f0" strokeWidth={6} />
      <line x1={96} y1={ROOM_H} x2={96} y2={ROOM_H - 42} stroke="#334155" strokeWidth={2.5} />
      <path
        d={`M96 ${ROOM_H - 42} A 42 42 0 0 1 138 ${ROOM_H}`}
        fill="none"
        stroke="#334155"
        strokeWidth={1.2}
        strokeDasharray="4 3"
      />
    </g>
  );
}

interface RoomTileProps {
  room: Room;
  slot: Slot;
  highlighted: boolean;
  onHover: (id: string | null) => void;
}

function RoomTile({ room, slot, highlighted, onHover }: RoomTileProps) {
  const { t, tk } = useT();
  const floor = room.occupied ? PROTOCOL_COLORS[room.protocol] : '#e2e8f0';
  const transform = slot.doorUp
    ? `translate(${slot.x} ${slot.y + ROOM_H}) scale(1 -1)`
    : `translate(${slot.x} ${slot.y})`;
  // Bloque de texto: a la derecha, en la zona libre de la habitación.
  const textX = slot.x + 120;
  const textY = slot.doorUp ? slot.y + 52 : slot.y + 136;
  const values = room.values;
  const label = room.occupied
    ? t('map.roomAria', {
        room: room.id,
        protocol: tk('protocol', room.protocol),
        temp: fmtTemp(values.tempC),
        light: fmtPct(values.lightPct),
        auto: room.auto ? t('common.on') : t('common.off'),
      })
    : t('map.roomFreeAria', { room: room.id });

  function onKeyDown(e: KeyboardEvent<SVGGElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openRoomView(room.id);
    }
  }

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={() => openRoomView(room.id)}
      onKeyDown={onKeyDown}
      onMouseEnter={() => onHover(room.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(room.id)}
      onBlur={() => onHover(null)}
      className="cursor-pointer outline-none"
      opacity={room.occupied ? 1 : 0.65}
    >
      <g transform={transform}>
        <Furniture floor={floor} />
      </g>
      {highlighted && (
        <rect
          x={slot.x + 3}
          y={slot.y + 3}
          width={ROOM_W - 6}
          height={ROOM_H - 6}
          fill="none"
          stroke="#0d9488"
          strokeWidth={5}
          rx={4}
        />
      )}
      <g fontFamily="Inter, system-ui, sans-serif" textAnchor="middle" pointerEvents="none">
        <text x={textX} y={textY} fontSize={22} fontWeight={700} fill="#0f172a">
          {room.id}
        </text>
        {room.occupied ? (
          <>
            <text x={textX} y={textY + 18} fontSize={12} fontWeight={600} fill="#1e293b">
              {tk('protocol', room.protocol)}
            </text>
            <text x={textX} y={textY + 34} fontSize={11.5} fill="#1e293b">
              {fmtTemp(values.tempC)}
            </text>
            <text x={textX} y={textY + 49} fontSize={11.5} fill="#1e293b">
              {t('map.light')} {fmtPct(values.lightPct)}
            </text>
            <text
              x={textX}
              y={textY + 64}
              fontSize={10.5}
              fontWeight={700}
              fill={room.auto ? '#0f766e' : '#9a3412'}
            >
              {room.auto ? t('map.aiOn') : t('map.aiOff')}
              {room.category ? ` · ${room.category}` : ''}
            </text>
          </>
        ) : (
          <text x={textX} y={textY + 18} fontSize={12} fill="#334155">
            {t('map.free')}
          </text>
        )}
      </g>
    </g>
  );
}

export function FloorPlan() {
  const { t, tk } = useT();
  const rooms = useApp((s) => s.rooms);
  const roomIds = useApp((s) => s.roomIds);
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <Card title={t('map.title')} titleId="map-title" icon="plan" subtitle={t('map.hint')}>
      <div className="overflow-x-auto rounded-xl ring-1 ring-inset ring-slate-200">
        <svg
          viewBox="0 0 1100 640"
          className="h-auto w-full min-w-[640px]"
          role="group"
          aria-labelledby="map-title"
        >
          <rect x={0} y={0} width={1100} height={640} fill="#f8fafc" />
          <pattern id="floor-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M20 0H0V20" fill="none" stroke="#e2e8f0" strokeWidth={0.6} />
          </pattern>
          <rect x={0} y={0} width={1100} height={640} fill="url(#floor-grid)" />
          {/* Pasillo */}
          <rect x={20} y={270} width={1060} height={100} fill="#eef2f6" stroke="#cbd5e1" />
          <text
            x={560}
            y={326}
            textAnchor="middle"
            fontSize={14}
            fontWeight={600}
            fill="#64748b"
            letterSpacing={6}
          >
            {t('map.corridor').toUpperCase()}
          </text>
          {/* Escaleras */}
          <g>
            <rect
              x={20}
              y={20}
              width={120}
              height={250}
              fill="#f1f5f9"
              stroke="#334155"
              strokeWidth={3}
            />
            {Array.from({ length: 10 }, (_, i) => (
              <line key={i} x1={35} x2={125} y1={40 + i * 20} y2={40 + i * 20} stroke="#94a3b8" />
            ))}
            <text x={80} y={258} textAnchor="middle" fontSize={13} fontWeight={600} fill="#1e293b">
              {t('map.stairs')}
            </text>
          </g>
          {/* Ascensores */}
          <g>
            <rect
              x={20}
              y={370}
              width={120}
              height={250}
              fill="#f1f5f9"
              stroke="#334155"
              strokeWidth={3}
            />
            {[0, 1].map((i) => (
              <g key={i}>
                <rect
                  x={35}
                  y={395 + i * 105}
                  width={90}
                  height={85}
                  fill="#cbd5e1"
                  stroke="#475569"
                />
                <line x1={80} x2={80} y1={395 + i * 105} y2={480 + i * 105} stroke="#475569" />
                <text
                  x={80}
                  y={445 + i * 105}
                  textAnchor="middle"
                  fontSize={13}
                  fontWeight={700}
                  fill="#1e293b"
                >
                  A{i + 1}
                </text>
              </g>
            ))}
            <text x={80} y={386} textAnchor="middle" fontSize={13} fontWeight={600} fill="#1e293b">
              {t('map.elevators')}
            </text>
          </g>
          {/* Control de enfermería */}
          <g>
            <rect
              x={960}
              y={20}
              width={120}
              height={250}
              fill="#ccfbf1"
              stroke="#0f766e"
              strokeWidth={3}
            />
            <path d="M975 200 h90 v40 h-90 z" fill="#5eead4" stroke="#0f766e" />
            <text
              x={1020}
              y={120}
              textAnchor="middle"
              fontSize={13}
              fontWeight={700}
              fill="#134e4a"
            >
              {t('map.nursing1')}
            </text>
            <text
              x={1020}
              y={137}
              textAnchor="middle"
              fontSize={13}
              fontWeight={700}
              fill="#134e4a"
            >
              {t('map.nursing2')}
            </text>
          </g>
          {/* Almacén */}
          <g>
            <rect
              x={960}
              y={370}
              width={120}
              height={250}
              fill="#f1f5f9"
              stroke="#334155"
              strokeWidth={3}
            />
            <text
              x={1020}
              y={500}
              textAnchor="middle"
              fontSize={13}
              fontWeight={600}
              fill="#1e293b"
            >
              {t('map.storage')}
            </text>
          </g>

          {roomIds.map((id, index) => {
            const room = rooms[id];
            if (!room) return null;
            return (
              <RoomTile
                key={id}
                room={room}
                slot={slotFor(index)}
                highlighted={hovered === id}
                onHover={setHovered}
              />
            );
          })}
        </svg>
      </div>
      <ul
        className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-600"
        aria-label={t('map.legend')}
      >
        {(Object.keys(PROTOCOL_COLORS) as (keyof typeof PROTOCOL_COLORS)[]).map((p) => (
          <li key={p} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: PROTOCOL_COLORS[p] }}
            />
            {tk('protocol', p)}
          </li>
        ))}
      </ul>
    </Card>
  );
}
