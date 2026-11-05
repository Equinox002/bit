import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DENOMINATIONS, chipFor, chipStacks, rackChips } from '../../resources/js/game/chips.js';

const total = (stacks) => stacks.reduce((sum, { chip, count }) => sum + chip.value * count, 0);
const uncapped = { maxColumns: 99, maxPerColumn: 100000 };

test('stacks add up to exactly the amount when nothing is capped', () => {
    for (const amount of [1, 4, 5, 9, 10, 30, 40, 70, 80, 99, 100, 990, 1000, 12345]) {
        assert.equal(total(chipStacks(amount, uncapped)), amount, `Amount ${amount}`);
        assert.equal(total(chipStacks(amount, { ...uncapped, spread: 3 })), amount, `Spread amount ${amount}`);
    }
});

test('common amounts use the chips a player would expect', () => {
    const shape = (amount, options) => chipStacks(amount, options).map(({ chip, count }) => [chip.value, count]);

    assert.deepEqual(shape(30), [[10, 3]]);
    assert.deepEqual(shape(80), [[50, 1], [10, 3]]);
    assert.deepEqual(shape(100), [[100, 1]]);
});

test('a spread stops one chip standing in for a large amount', () => {
    const [largest] = chipStacks(1000, { spread: 5, ...uncapped });

    assert.equal(largest.chip.value, 100);
    assert.equal(largest.count, 10);
});

test('nothing is drawn for an empty or invalid amount', () => {
    for (const amount of [0, -5, null, undefined, NaN, 'none']) {
        assert.deepEqual(chipStacks(amount), []);
    }
});

test('stacks never exceed their limits, whatever the amount', () => {
    for (const amount of [1, 999, 123456, 10000000, 987654321]) {
        const stacks = chipStacks(amount, { maxColumns: 2, maxPerColumn: 4 });

        assert.ok(stacks.length >= 1 && stacks.length <= 2, `Columns for ${amount}`);
        stacks.forEach(({ count }) => assert.ok(count >= 1 && count <= 4, `Height for ${amount}`));
    }
});

test('the rack only offers chips a player could legally bet', () => {
    const values = (limits) => rackChips(limits).map((chip) => chip.value);

    assert.deepEqual(values({ min: 10, max: 990 }), [10, 50, 100, 500]);
    assert.deepEqual(values({ min: 10, max: 80 }), [10, 50]);
    assert.deepEqual(values({ min: 7, max: 9 }), []);
    assert.deepEqual(values({ min: 1, max: 5 }), [1, 5]);
});

test('every chip can be told apart and drawn', () => {
    assert.equal(new Set(DENOMINATIONS.map((chip) => chip.color)).size, DENOMINATIONS.length);
    assert.equal(chipFor(75).value, 50);
    assert.equal(chipFor(0).value, 1);
});
