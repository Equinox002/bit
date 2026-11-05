const inputClass = 'w-full min-h-11 rounded-lg border border-white/15 bg-ink-800 px-3 py-2 text-sm text-ivory-50 focus:border-gold-400 focus:ring-gold-400';

function Row({ label, hint, error, children }) {
    return (
        <div>
            <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                    <div className="text-sm font-medium text-ivory-100">{label}</div>
                    {hint && <div className="text-xs text-ivory-400">{hint}</div>}
                </div>
                {children}
            </div>
            {error && <p className="mt-1 text-xs text-loss-300">{error}</p>}
        </div>
    );
}

export function NumberField({ label, hint, value, onChange, min, max, step = 1, error }) {
    return (
        <Row label={label} hint={hint} error={error}>
            <input
                type="number"
                inputMode="numeric"
                aria-label={label}
                className={`${inputClass} !w-28 shrink-0 text-right`}
                value={value}
                min={min}
                max={max}
                step={step}
                onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))}
            />
        </Row>
    );
}

export function Toggle({ label, hint, value, onChange, error }) {
    return (
        <Row label={label} hint={hint} error={error}>
            <button
                type="button"
                role="switch"
                aria-checked={value}
                aria-label={label}
                onClick={() => onChange(!value)}
                className={`relative h-7 w-12 shrink-0 rounded-full transition ${value ? 'bg-gold-500' : 'bg-ink-600'}`}
            >
                <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-ivory-50 shadow transition-all ${value ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
        </Row>
    );
}

export function SelectField({ label, hint, value, onChange, options, error }) {
    return (
        <Row label={label} hint={hint} error={error}>
            <select
                aria-label={label}
                className={`${inputClass} !w-40 shrink-0`}
                value={value}
                onChange={(event) => onChange(event.target.value)}
            >
                {Object.entries(options).map(([key, text]) => (
                    <option key={key} value={key}>
                        {text}
                    </option>
                ))}
            </select>
        </Row>
    );
}

export function TextField({ label, value, onChange, error, maxLength, placeholder, autoFocus, name }) {
    return (
        <label className="block">
            <span className="mb-1 block text-sm font-medium text-ivory-100">{label}</span>
            <input
                type="text"
                name={name}
                className={inputClass}
                value={value}
                maxLength={maxLength}
                placeholder={placeholder}
                autoFocus={autoFocus}
                autoComplete="off"
                onChange={(event) => onChange(event.target.value)}
            />
            {error && <span className="mt-1 block text-xs text-loss-300">{error}</span>}
        </label>
    );
}

function Group({ title, children }) {
    return (
        <fieldset className="space-y-4">
            <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-gold-400">{title}</legend>
            {children}
        </fieldset>
    );
}

export function PlayerChipSettings({ values, set, errors = {}, maxSeats = 12, local = false }) {
    return (
        <div className="space-y-8">
            {/* A shared device has its names listed already, and no connections or timers to manage. */}
            {!local && (
                <Group title="Players">
                    <NumberField label="Minimum players" value={values.minPlayers} onChange={set('minPlayers')} min={2} max={maxSeats} error={errors['settings.minPlayers']} />
                    <NumberField label="Maximum players" value={values.maxPlayers} onChange={set('maxPlayers')} min={2} max={maxSeats} error={errors['settings.maxPlayers']} />
                    <Toggle label="Allow late joining" hint="New players pay in and get cards at the next deal" value={values.allowLateJoin} onChange={set('allowLateJoin')} />
                    <NumberField label="Turn timer (seconds)" hint="When time runs out, the player passes" value={values.turnTimeout} onChange={set('turnTimeout')} min={10} max={300} error={errors['settings.turnTimeout']} />
                </Group>
            )}
            <Group title="Chips">
                <NumberField label="Starting chips" value={values.startingChips} onChange={set('startingChips')} min={1} error={errors['settings.startingChips']} />
                <NumberField label="Contribution per player" hint="Each player pays this into the pot" value={values.contribution} onChange={set('contribution')} min={0} error={errors['settings.contribution']} />
                <NumberField label="Extra pot seed" hint="Added to the pot once, on top of contributions" value={values.potSeed} onChange={set('potSeed')} min={0} error={errors['settings.potSeed']} />
            </Group>
        </div>
    );
}

export function BettingSettings({ values, set, errors = {} }) {
    return (
        <div className="space-y-8">
            <Group title="Bet limits">
                <NumberField label="Minimum bet" hint="Drops automatically when the pot has less left" value={values.minBet} onChange={set('minBet')} min={1} error={errors['settings.minBet']} />
                <NumberField label="Maximum bet" hint="0 means limited only by the pot and your chips" value={values.maxBet} onChange={set('maxBet')} min={0} error={errors['settings.maxBet']} />
                <NumberField
                    label="Winning multiplier"
                    hint="2 pays back your stake plus an equal win"
                    value={values.multiplier === '' ? '' : values.multiplier / 100}
                    onChange={(value) => set('multiplier')(value === '' ? '' : Math.round(value * 100))}
                    min={1.1}
                    max={10}
                    step={0.1}
                    error={errors['settings.multiplier']}
                />
            </Group>
            <Group title="Participation">
                <Toggle label="Allow betting on your own cards" value={values.allowSelfBet} onChange={set('allowSelfBet')} />
                <Toggle label="Allow other players to join in" value={values.allowOthers} onChange={set('allowOthers')} error={errors['settings.allowOthers']} />
                <Toggle label="Skipping keeps the turn open" hint="Off: if the active player skips, nobody else is asked" value={values.allowSkip} onChange={set('allowSkip')} />
                <NumberField label="Maximum participants per turn" hint="0 means no limit" value={values.maxParticipants} onChange={set('maxParticipants')} min={0} max={12} error={errors['settings.maxParticipants']} />
                <SelectField label="Betting order" value={values.bettingOrder} onChange={set('bettingOrder')} options={{ clockwise: 'Clockwise', counterclockwise: 'Counterclockwise' }} />
                <Toggle label="Stop asking when the pot is covered" hint="Off: remaining players are listed as passing" value={values.endOnPotExhausted} onChange={set('endOnPotExhausted')} />
                <p className="text-xs text-ivory-400">Invited players can always decline. Nobody is ever forced to bet.</p>
            </Group>
        </div>
    );
}

export function AdvancedSettings({ values, set, errors = {}, local = false }) {
    const handling = { skip: 'Skip the turn', replace: 'Replace the hand' };

    return (
        <div className="space-y-8">
            <Group title="Cards">
                <SelectField label="Ace counts as" value={values.aceHigh ? 'high' : 'low'} onChange={(value) => set('aceHigh')(value === 'high')} options={{ low: 'Low (A = 1)', high: 'High (A = 14)' }} />
                <SelectField label="Boundary cards" value={values.inclusiveBoundaries ? 'inclusive' : 'strict'} onChange={(value) => set('inclusiveBoundaries')(value === 'inclusive')} options={{ strict: 'Lose (strictly between)', inclusive: 'Win (inclusive)' }} />
                <SelectField label="Identical cards" value={values.identicalHandling} onChange={set('identicalHandling')} options={handling} />
                <SelectField label="Consecutive cards" value={values.consecutiveHandling} onChange={set('consecutiveHandling')} options={handling} />
                <SelectField label="When the deck runs out" value={values.deckEmptyRule} onChange={set('deckEmptyRule')} options={{ reset: 'Start a new round', reshuffle: 'Reshuffle used cards' }} />
                <SelectField label="Other players' cards" value={values.cardVisibility} onChange={set('cardVisibility')} options={{ open: 'Face up', hidden: 'Hidden until their turn' }} />
            </Group>
            <Group title="Narrow-range reset">
                <Toggle label="Re-deal when most hands are narrow" value={values.autoReset} onChange={set('autoReset')} />
                {values.autoReset && (
                    <>
                        <NumberField label="Narrow means a gap of at most" hint="Gap is the count of winning ranks" value={values.narrowMaxGap} onChange={set('narrowMaxGap')} min={0} max={11} error={errors['settings.narrowMaxGap']} />
                        <NumberField label="At least this many players" value={values.narrowMinPlayers} onChange={set('narrowMinPlayers')} min={1} max={12} error={errors['settings.narrowMinPlayers']} />
                        <NumberField label="And this percentage of players" value={values.narrowPercent} onChange={set('narrowPercent')} min={1} max={100} error={errors['settings.narrowPercent']} />
                        <SelectField label="When to re-deal" value={values.narrowTiming} onChange={set('narrowTiming')} options={{ immediate: 'Immediately', after_cycle: 'After all turns' }} />
                    </>
                )}
            </Group>
            <Group title={local ? 'Rounds' : 'Rounds and hosting'}>
                <Toggle label={local ? 'Allow resetting the round' : 'Host can reset the round'} value={values.allowManualReset} onChange={set('allowManualReset')} />
                <NumberField label="Maximum betting cycles" hint="1 deals new cards once everyone has had a turn; 0 keeps the same cards until a reset" value={values.maxCycles} onChange={set('maxCycles')} min={0} max={100} error={errors['settings.maxCycles']} />
                <Toggle label="New cards if nobody bets for a full cycle" value={values.resetOnIdleCycle} onChange={set('resetOnIdleCycle')} />
                <Toggle label="Everyone contributes at each new round" hint="Added to whatever is left in the pot. Off: only when the pot is empty" value={values.contributeEveryRound} onChange={set('contributeEveryRound')} />
                <Toggle label="Rotate the starting player each round" value={values.dealerRotation} onChange={set('dealerRotation')} />
                <SelectField
                    label="First starting player"
                    value={values.startingPlayer}
                    onChange={set('startingPlayer')}
                    options={local ? { random: 'Random', first_seat: 'First seat' } : { random: 'Random', host: 'The host', first_seat: 'First seat' }}
                />
                {!local && (
                    <SelectField label="If the host disconnects" value={values.hostPolicy} onChange={set('hostPolicy')} options={{ next_seat: 'Next seat takes over', longest_member: 'Longest-seated takes over', none: 'Keep the host' }} />
                )}
            </Group>
        </div>
    );
}

export function SettingsSummary({ settings, multiplierLabel, chips }) {
    const items = [
        ['Starting chips', chips(settings.startingChips)],
        ['Contribution', `${chips(settings.contribution)} ${settings.contributeEveryRound ? 'each round' : 'if pot empty'}`],
        ['Bet range', `${chips(settings.minBet)} – ${settings.maxBet > 0 ? chips(settings.maxBet) : 'pot'}`],
        ['Multiplier', multiplierLabel(settings.multiplier)],
        ['Players', `${settings.minPlayers} – ${settings.maxPlayers}`],
        ['Turn timer', `${settings.turnTimeout}s`],
        ['Ace', settings.aceHigh ? 'High' : 'Low'],
        ['Boundaries', settings.inclusiveBoundaries ? 'Win' : 'Lose'],
        ['Other cards', settings.cardVisibility === 'open' ? 'Face up' : 'Hidden'],
        ['Cycles', settings.maxCycles > 0 ? settings.maxCycles : 'No limit'],
    ];

    return (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {items.map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-2 border-b border-white/5 pb-1">
                    <dt className="text-ivory-400">{label}</dt>
                    <dd className="font-medium text-ivory-100">{value}</dd>
                </div>
            ))}
        </dl>
    );
}
