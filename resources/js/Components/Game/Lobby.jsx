import { Check, Copy, Crown, LogOut, Play, Settings2, Share2, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AdvancedSettings, BettingSettings, PlayerChipSettings, SettingsSummary } from '@/Components/Game/SettingsFields';
import { Avatar, Button, Dialog, Panel } from '@/Components/Game/ui';
import { chips, copyText, multiplierLabel } from '@/game/format';

function CopyButton({ text, label, icon: Icon = Copy, variant = 'secondary' }) {
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        if (await copyText(text)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        }
    };

    return (
        <Button variant={variant} onClick={copy} className="flex-1">
            {copied ? <Check className="h-4 w-4 text-win-400" aria-hidden="true" /> : <Icon className="h-4 w-4" aria-hidden="true" />}
            {copied ? 'Copied' : label}
        </Button>
    );
}

function ShareButton({ room }) {
    if (!navigator.share) {
        return <CopyButton text={room.inviteUrl} label="Copy Invite Link" icon={Share2} />;
    }

    return (
        <Button
            variant="secondary"
            className="flex-1"
            onClick={() => navigator.share({ title: room.name, text: `Join my table with code ${room.code}`, url: room.inviteUrl }).catch(() => {})}
        >
            <Share2 className="h-4 w-4" aria-hidden="true" /> Share Invitation
        </Button>
    );
}

function SettingsEditor({ room, open, onClose, onSave, error, busy, presets }) {
    const [values, setValues] = useState(room.settings);
    const set = (key) => (value) => setValues((current) => ({ ...current, [key]: value }));

    useEffect(() => {
        if (open) {
            setValues(room.settings);
        }
    }, [open, room.settings]);

    const save = async () => {
        if (await onSave('custom', values)) {
            onClose();
        }
    };

    return (
        <Dialog open={open} onClose={onClose} title="Game settings" wide>
            <div className="mb-5">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gold-400">Start from a preset</span>
                <div className="flex gap-2">
                    {[['quick', 'Quick'], ['classic', 'Classic']].map(([key, title]) => (
                        <Button key={key} variant="secondary" className="flex-1" onClick={() => setValues(presets[key])}>{title}</Button>
                    ))}
                </div>
            </div>
            <div className="space-y-8">
                <PlayerChipSettings values={values} set={set} />
                <BettingSettings values={values} set={set} />
                <AdvancedSettings values={values} set={set} />
            </div>
            {error && <p className="mt-4 rounded-lg bg-loss-600/15 px-3 py-2 text-sm text-loss-300">{error}</p>}
            <div className="sticky bottom-0 -mx-5 -mb-4 mt-5 flex gap-2 border-t border-white/10 bg-ink-900 px-5 py-3">
                <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
                <Button className="flex-1" disabled={busy} onClick={save}>Save Settings</Button>
            </div>
        </Dialog>
    );
}

export default function Lobby({ game, presets }) {
    const { room, start, leave, updateSettings, error, busy } = game;
    const [editing, setEditing] = useState(false);
    const needed = room.settings.minPlayers - room.members.length;
    const pot = room.settings.contribution * room.members.length + room.settings.potSeed;

    return (
        <div className="mx-auto grid w-full max-w-5xl gap-4 py-4 md:grid-cols-[1fr_1fr]">
            <div className="space-y-4">
                <Panel className="p-6 text-center">
                    <p className="break-words font-display text-lg text-ivory-100">{room.name}</p>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-[0.25em] text-ivory-400">Room code</p>
                    <p data-testid="room-code" className="my-1 select-all font-display text-4xl font-bold tracking-[0.18em] text-gold-300 sm:text-5xl">{room.code}</p>
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <CopyButton text={room.code} label="Copy Code" />
                        <ShareButton room={room} />
                    </div>
                </Panel>

                <Panel className="p-5">
                    <div className="mb-3 flex items-center justify-between gap-2">
                        <h2 className="text-sm font-semibold uppercase tracking-wider text-gold-400">Game settings</h2>
                        {room.isHost && (
                            <Button variant="ghost" className="!min-h-9 !py-1" onClick={() => setEditing(true)}>
                                <Settings2 className="h-4 w-4" aria-hidden="true" /> Edit
                            </Button>
                        )}
                    </div>
                    <SettingsSummary settings={room.settings} multiplierLabel={multiplierLabel} chips={chips} />
                </Panel>
            </div>

            <Panel className="flex flex-col p-5">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gold-400">
                    Players ({room.members.length} of {room.settings.maxPlayers})
                </h2>
                <ul className="flex-1 space-y-2" data-testid="lobby-players">
                    {room.members.map((member) => (
                        <li key={member.id} className="flex items-center gap-3 rounded-xl bg-ink-800 px-3 py-2">
                            <Avatar name={member.name} hue={member.hue} />
                            <span className="min-w-0 flex-1 truncate font-medium text-ivory-50">
                                {member.name}
                                {member.id === room.you && <span className="ml-1 text-xs font-normal text-ivory-400">(you)</span>}
                            </span>
                            {member.isHost && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-gold-500/15 px-2 py-0.5 text-xs font-medium text-gold-300">
                                    <Crown className="h-3 w-3" aria-hidden="true" /> Host
                                </span>
                            )}
                            {member.connected ? (
                                <Wifi className="h-4 w-4 text-win-400" aria-label="Connected" />
                            ) : (
                                <WifiOff className="h-4 w-4 text-loss-400" aria-label="Disconnected" />
                            )}
                        </li>
                    ))}
                </ul>

                <div className="mt-4 space-y-2">
                    <p className="text-center text-sm text-ivory-400">
                        {needed > 0
                            ? `Waiting for ${needed} more ${needed === 1 ? 'player' : 'players'} to join.`
                            : `The pot will start at ${chips(pot)} chips.`}
                    </p>
                    {error && !editing && <p className="rounded-lg bg-loss-600/15 px-3 py-2 text-center text-sm text-loss-300">{error}</p>}
                    {room.isHost ? (
                        <Button className="w-full text-base" disabled={needed > 0 || busy} onClick={start}>
                            <Play className="h-4 w-4" aria-hidden="true" /> Start Game
                        </Button>
                    ) : (
                        <p className="rounded-xl bg-ink-800 px-3 py-3 text-center text-sm text-ivory-200">Waiting for the host to start the game.</p>
                    )}
                    <Button variant="ghost" className="w-full" onClick={leave}>
                        <LogOut className="h-4 w-4" aria-hidden="true" /> Leave Room
                    </Button>
                </div>
            </Panel>

            <SettingsEditor room={room} open={editing} onClose={() => setEditing(false)} onSave={updateSettings} error={error} busy={busy} presets={presets} />
        </div>
    );
}
