import { Head, useForm } from '@inertiajs/react';
import { ArrowLeft, ArrowRight, Check, Lock, Zap, Crown, SlidersHorizontal, Globe } from 'lucide-react';
import { useState } from 'react';
import { Button, Panel } from '@/Components/Game/ui';
import {
    AdvancedSettings,
    BettingSettings,
    PlayerChipSettings,
    SettingsSummary,
    TextField,
} from '@/Components/Game/SettingsFields';
import { chips, multiplierLabel } from '@/game/format';
import SiteLayout from '@/Layouts/SiteLayout';

const STEPS = ['Room Details', 'Players & Chips', 'Betting Rules', 'Advanced Rules', 'Review & Create'];

const PRESETS = [
    { key: 'quick', title: 'Quick Game', icon: Zap, text: 'Fewer chips and a shorter timer.' },
    { key: 'classic', title: 'Classic Game', icon: Crown, text: 'Standard rules, with new cards once everyone has had a turn.' },
    { key: 'custom', title: 'Custom Game', icon: SlidersHorizontal, text: 'Start from the standard rules and adjust anything.' },
];

// Which wizard step shows each setting, so a server error can jump to the right place.
const STEP_FOR_SETTING = {
    minPlayers: 1, maxPlayers: 1, allowLateJoin: 1, turnTimeout: 1, startingChips: 1, contribution: 1, potSeed: 1,
    minBet: 2, maxBet: 2, multiplier: 2, allowSelfBet: 2, allowOthers: 2, allowSkip: 2, maxParticipants: 2, bettingOrder: 2, endOnPotExhausted: 2,
};

export default function Create({ presets, maxSeats, defaultName, notice }) {
    const [step, setStep] = useState(0);
    const form = useForm({
        name: defaultName ? `${defaultName}'s Table` : '',
        hostName: defaultName ?? '',
        isPrivate: true,
        preset: 'classic',
        settings: presets.classic,
    });
    const { data, errors } = form;
    const set = (key) => (value) => form.setData('settings', { ...data.settings, [key]: value });
    const detailsValid = data.name.trim() !== '' && data.hostName.trim() !== '';

    const choosePreset = (key) => form.setData((current) => ({ ...current, preset: key, settings: presets[key] }));

    const submit = () => {
        form.post(route('rooms.store'), {
            onError: (failed) => {
                const field = Object.keys(failed)[0] ?? '';

                if (field.startsWith('settings.')) {
                    setStep(STEP_FOR_SETTING[field.replace('settings.', '')] ?? 3);
                } else {
                    setStep(0);
                }
            },
        });
    };

    return (
        <SiteLayout>
            <Head title="Create a Room" />
            <div className="mx-auto max-w-2xl py-4">
                <h1 className="font-display text-3xl font-bold text-ivory-50">Create a room</h1>
                {notice && <p className="mt-2 rounded-lg border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-sm text-gold-200">{notice}</p>}

                <ol className="my-5 flex items-center gap-1.5" aria-label="Progress">
                    {STEPS.map((title, index) => (
                        <li key={title} className="flex-1">
                            <button
                                type="button"
                                aria-label={`Step ${index + 1}: ${title}`}
                                aria-current={index === step ? 'step' : undefined}
                                disabled={!detailsValid && index > 0}
                                onClick={() => setStep(index)}
                                className={`block h-1.5 w-full rounded-full transition ${index <= step ? 'bg-gold-400' : 'bg-ink-700'}`}
                            />
                        </li>
                    ))}
                </ol>
                <p className="mb-3 text-sm text-ivory-400">
                    Step {step + 1} of {STEPS.length}: <span className="font-medium text-ivory-100">{STEPS[step]}</span>
                </p>

                <Panel className="p-5 sm:p-6">
                    {step === 0 && (
                        <div className="space-y-5">
                            <TextField label="Room name" name="name" value={data.name} onChange={(value) => form.setData('name', value)} error={errors.name} maxLength={60} placeholder="Friday Night Table" autoFocus />
                            <TextField label="Your display name" name="hostName" value={data.hostName} onChange={(value) => form.setData('hostName', value)} error={errors.hostName} maxLength={24} />

                            <div>
                                <span className="mb-2 block text-sm font-medium text-ivory-100">Game type</span>
                                <div className="grid gap-2 sm:grid-cols-3">
                                    {PRESETS.map(({ key, title, icon: Icon, text }) => (
                                        <button
                                            key={key}
                                            type="button"
                                            aria-pressed={data.preset === key}
                                            onClick={() => choosePreset(key)}
                                            className={`rounded-xl border p-3 text-left transition ${data.preset === key ? 'border-gold-400 bg-gold-500/10' : 'border-white/10 bg-ink-800 hover:border-white/25'}`}
                                        >
                                            <Icon className="mb-1 h-5 w-5 text-gold-400" aria-hidden="true" />
                                            <span className="block text-sm font-semibold text-ivory-50">{title}</span>
                                            <span className="block text-xs text-ivory-400">{text}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <span className="mb-2 block text-sm font-medium text-ivory-100">Privacy</span>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        [true, 'Private', 'Only people with the code', Lock],
                                        [false, 'Public', 'Open to Play Now too', Globe],
                                    ].map(([value, title, text, Icon]) => (
                                        <button
                                            key={title}
                                            type="button"
                                            aria-pressed={data.isPrivate === value}
                                            onClick={() => form.setData('isPrivate', value)}
                                            className={`rounded-xl border p-3 text-left transition ${data.isPrivate === value ? 'border-gold-400 bg-gold-500/10' : 'border-white/10 bg-ink-800 hover:border-white/25'}`}
                                        >
                                            <Icon className="mb-1 h-4 w-4 text-gold-400" aria-hidden="true" />
                                            <span className="block text-sm font-semibold text-ivory-50">{title}</span>
                                            <span className="block text-xs text-ivory-400">{text}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 1 && <PlayerChipSettings values={data.settings} set={set} errors={errors} maxSeats={maxSeats} />}
                    {step === 2 && <BettingSettings values={data.settings} set={set} errors={errors} />}
                    {step === 3 && <AdvancedSettings values={data.settings} set={set} errors={errors} />}

                    {step === 4 && (
                        <div className="space-y-4">
                            <div>
                                <h2 className="break-words font-display text-xl text-ivory-50">{data.name}</h2>
                                <p className="text-sm text-ivory-400">
                                    Hosted by {data.hostName} · {data.isPrivate ? 'Private' : 'Public'} · {PRESETS.find((p) => p.key === data.preset).title}
                                </p>
                            </div>
                            <SettingsSummary settings={data.settings} multiplierLabel={multiplierLabel} chips={chips} />
                            <p className="text-sm text-ivory-300">
                                With 3 players, the pot starts at <strong className="text-gold-300">{chips(Number(data.settings.contribution) * 3 + Number(data.settings.potSeed))}</strong> chips.
                            </p>
                        </div>
                    )}
                </Panel>

                <div className="mt-4 flex items-center justify-between gap-2">
                    <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={step === 0}>
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
                    </Button>

                    <div className="flex gap-2">
                        {step < 4 ? (
                            <>
                                <Button variant="secondary" disabled={!detailsValid} onClick={() => setStep(4)}>
                                    Skip to Review
                                </Button>
                                <Button disabled={!detailsValid} onClick={() => setStep(step + 1)}>
                                    Next <ArrowRight className="h-4 w-4" aria-hidden="true" />
                                </Button>
                            </>
                        ) : (
                            <Button disabled={form.processing || !detailsValid} onClick={submit}>
                                <Check className="h-4 w-4" aria-hidden="true" /> Create Room
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </SiteLayout>
    );
}
