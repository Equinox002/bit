/**
 * Casino chips, largest first. The colours follow the usual casino convention where one exists.
 * Green is left out so that no chip disappears against the felt.
 */
export const DENOMINATIONS = [
    { value: 100000, label: '100K', color: '#7a1430', edge: '#4d0b1d', spot: '#f3e2b5' },
    { value: 50000, label: '50K', color: '#0f5e78', edge: '#093c4d', spot: '#f3e2b5' },
    { value: 10000, label: '10K', color: '#8a95a3', edge: '#5a6470', spot: '#14181c' },
    { value: 5000, label: '5K', color: '#c2417a', edge: '#85274f', spot: '#faf7ef' },
    { value: 1000, label: '1K', color: '#d4a72c', edge: '#8f6e14', spot: '#14181c' },
    { value: 500, label: '500', color: '#6b2fa0', edge: '#451c6b', spot: '#faf7ef' },
    { value: 100, label: '100', color: '#3a4146', edge: '#16191b', spot: '#ecd08a' },
    { value: 50, label: '50', color: '#d9772b', edge: '#96501a', spot: '#faf7ef' },
    { value: 10, label: '10', color: '#1f5fbf', edge: '#133e80', spot: '#faf7ef' },
    { value: 5, label: '5', color: '#c0322b', edge: '#7f1f1a', spot: '#faf7ef' },
    { value: 1, label: '1', color: '#ece6d6', edge: '#a9a292', spot: '#1f5fbf' },
];

/**
 * Splits an amount into columns of chips for drawing, largest first.
 *
 * `spread` limits the largest chip to that fraction of the amount, so a big stack looks like many
 * chips rather than one. Columns and heights are capped to fit the table, so a capped stack shows
 * less than its amount; the number beside it is always the exact value.
 */
export function chipStacks(amount, { spread = 1, maxColumns = 3, maxPerColumn = 6 } = {}) {
    let left = Math.floor(Number(amount) || 0);

    if (left <= 0) {
        return [];
    }

    const largest = left / spread;
    const stacks = [];

    for (const chip of DENOMINATIONS) {
        if (chip.value > largest && chip.value > 1) {
            continue;
        }

        const count = Math.floor(left / chip.value);

        if (count > 0) {
            stacks.push({ chip, count: Math.min(count, maxPerColumn) });
            left -= count * chip.value;
        }
    }

    return stacks.slice(0, maxColumns);
}

/**
 * The chips a player can tap to build a bet: the smallest ones they could legally bet with.
 */
export function rackChips({ min, max }, size = 4) {
    return DENOMINATIONS
        .filter((chip) => chip.value >= min && chip.value <= max)
        .reverse()
        .slice(0, size);
}

/**
 * A representative chip for icons, matching the amount where one is given.
 */
export function chipFor(value = 100) {
    return DENOMINATIONS.find((chip) => chip.value <= value) ?? DENOMINATIONS[DENOMINATIONS.length - 1];
}
