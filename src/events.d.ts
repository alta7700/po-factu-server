interface EventsMap {
    room_state_load: {state: RoomState};

    player_new: {player: Player};
    player_ready_state: {playerId: PlayerId, state: boolean};
    player_change_name: {playerId: PlayerId, name: string};
    player_dropped: {playerId: PlayerId, factId: FactId, byPlayerId: PlayerId, score: number};
    player_disconnect: {playerId: PlayerId};
    player_reconnect: {playerId: PlayerId};
    player_exclude: {playerId: PlayerId};
    player_punished: {playerId: PlayerId, scores: number};
    leader_switch: {playerId: PlayerId};

    start_facts: {};
    fact_new: {fact: Fact};
    fact_drop: {factId: FactId};

    start_about: {};

    start_turns: {};
    turn_new: {playerId: PlayerId, factId?: FactId};
    answer_mistake: {playerId: PlayerId, factId: FactId, ownerId: PlayerId, score: number};

    finish_game: {};
}

type GameEventKey = keyof EventsMap
type GameEvent<K extends GameEventKey = GameEventKey> = {
    key: K;
    data: EventsMap[K];
}