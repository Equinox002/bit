import { Head } from '@inertiajs/react';
import Lobby from '@/Components/Game/Lobby';
import { GameOver } from '@/Components/Game/RoundOverlays';
import Table from '@/Components/Game/Table';
import useGameRoom from '@/game/useGameRoom';
import SiteLayout from '@/Layouts/SiteLayout';

/**
 * One page for a room's whole life, so every player moves from lobby to table to results together.
 */
export default function Room({ initial, presets }) {
    const gameRoom = useGameRoom(initial);
    const { room } = gameRoom;

    if (room.status === 'playing' && room.game) {
        return (
            <>
                <Head title={`${room.name} · ${room.code}`} />
                <Table gameRoom={gameRoom} />
            </>
        );
    }

    return (
        <SiteLayout>
            <Head title={`${room.name} · ${room.code}`} />
            {room.status === 'finished' && room.game?.final ? (
                <GameOver game={room.game} />
            ) : (
                <Lobby game={gameRoom} presets={presets} />
            )}
        </SiteLayout>
    );
}
