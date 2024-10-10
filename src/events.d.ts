interface EventsMap {
    room_state_load: {state: RoomState};

    player_new: {player: Player};
    player_ready_state: {playerId: PlayerId, state: boolean};
    player_disconnect: {playerId: PlayerId};
    player_reconnect: {playerId: PlayerId};
    player_exclude: {playerId: PlayerId};
    leader_switch: {playerId: PlayerId};

    fact_new: {fact: Fact};
    fact_drop: {factId: FactId};

    turn_new: {playerId: PlayerId};

    answer_sent: {playerId: PlayerId};
    answer_drop: {playerId: PlayerId};

    finish_game: {result: PlayerFinalResult};
}

type GameEventKey = keyof EventsMap
type GameEvent<K extends GameEventKey = GameEventKey> = {
    key: K;
    data: EventsMap[K];
}