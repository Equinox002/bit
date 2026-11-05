import { memo } from 'react';
import { chipFor, chipStacks } from '@/game/chips';

/**
 * A chip seen from above, with its value printed in the middle. Decorative: whatever it shows is
 * also given as text or as a label on its button.
 */
export function PokerChip({ chip = chipFor(), label = true, className = 'h-11 w-11' }) {
    return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className={`shrink-0 ${className}`}>
            <circle cx="24" cy="24" r="23.5" fill={chip.edge} />
            <circle cx="24" cy="24" r="22" fill={chip.color} />
            <circle cx="24" cy="24" r="19.5" fill="none" stroke={chip.spot} strokeWidth="4.5" strokeDasharray="10.2 10.2" />
            <circle cx="24" cy="24" r="14.5" fill={chip.edge} stroke={chip.spot} strokeWidth="1" />
            <ellipse cx="24" cy="13" rx="15" ry="8" fill="#fff" opacity="0.1" />
            {label && (
                <text
                    x="24"
                    y="24"
                    dy="0.36em"
                    textAnchor="middle"
                    fill={chip.spot}
                    fontFamily="Figtree, sans-serif"
                    fontWeight="800"
                    fontSize={chip.label.length > 3 ? 10 : chip.label.length > 2 ? 12 : 15}
                >
                    {chip.label}
                </text>
            )}
        </svg>
    );
}

const WIDTH = 44;
const RADIUS_X = 20;
const RADIUS_Y = 10;
const THICKNESS = 5;

/**
 * One column of identical chips from the side. Each chip sits slightly off-centre, in a fixed
 * pattern so that a stack doesn't jump about when the game updates.
 */
function ChipColumn({ chip, count, size }) {
    const height = RADIUS_Y * 2 + THICKNESS * count + 3;
    const chipTops = Array.from({ length: count }, (_, index) => ({
        y: height - RADIUS_Y - THICKNESS * (index + 1) - 2,
        x: WIDTH / 2 + [0, 0.8, -0.5, 0.4, -0.9, 0.6][index % 6],
    }));
    const top = chipTops[count - 1];

    return (
        <svg viewBox={`0 0 ${WIDTH} ${height}`} aria-hidden="true" width={size} height={(size * height) / WIDTH} className="shrink-0 overflow-visible">
            <ellipse cx={WIDTH / 2} cy={height - RADIUS_Y} rx={RADIUS_X + 1} ry={RADIUS_Y} fill="#000" opacity="0.4" />

            {chipTops.map(({ x, y }, index) => (
                <g key={index}>
                    <path
                        d={`M${x - RADIUS_X},${y} v${THICKNESS} a${RADIUS_X},${RADIUS_Y} 0 0 0 ${RADIUS_X * 2},0 v-${THICKNESS} z`}
                        fill={chip.edge}
                    />
                    <path
                        d={`M${x - RADIUS_X},${y + THICKNESS / 2} a${RADIUS_X},${RADIUS_Y} 0 0 0 ${RADIUS_X * 2},0`}
                        fill="none"
                        stroke={chip.spot}
                        strokeWidth={THICKNESS - 1}
                        strokeDasharray="6 7.5"
                    />
                    <ellipse cx={x} cy={y} rx={RADIUS_X} ry={RADIUS_Y} fill={chip.color} />
                </g>
            ))}

            <ellipse cx={top.x} cy={top.y} rx={RADIUS_X - 2.5} ry={RADIUS_Y - 1.4} fill="none" stroke={chip.spot} strokeWidth="2.6" strokeDasharray="6 6" />
            <ellipse cx={top.x} cy={top.y} rx={RADIUS_X - 8} ry={RADIUS_Y - 4} fill={chip.edge} stroke={chip.spot} strokeWidth="0.7" />
            <ellipse cx={top.x} cy={top.y - 3} rx={RADIUS_X - 6} ry={RADIUS_Y - 6} fill="#fff" opacity="0.1" />
        </svg>
    );
}

/**
 * An amount as stacks of real denominations, standing on their base. Decorative: the exact number
 * is always shown as text beside it.
 */
export const ChipStack = memo(({ amount, size = 24, spread = 1, maxColumns = 3, maxPerColumn = 6, className = '', ...props }) => {
    const stacks = chipStacks(amount, { spread, maxColumns, maxPerColumn });

    if (stacks.length === 0) {
        return null;
    }

    return (
        <div aria-hidden="true" className={`flex items-end justify-center ${className}`} {...props}>
            {stacks.map(({ chip, count }, index) => (
                <div key={chip.value} style={{ marginLeft: index === 0 ? 0 : -size * 0.14 }}>
                    <ChipColumn chip={chip} count={count} size={size} />
                </div>
            ))}
        </div>
    );
});
