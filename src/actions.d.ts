interface ActionsMap {
    send_ready_state: {data: {state: boolean}, answer: {state: boolean}};

    start_facts: {data: {}, answer: {}};
    fact_add: {data: {text: string}, answer: {fact: Fact}};
    fact_drop: {data: {}, answer: {}};

    start_about: {data: {}, answer: {}};

    send_turn_answer: {data: {playerId: PlayerId}, answer: {guess: boolean, scores: number}};
    skip_turn_answer: {data: {}, answer: {}};
    leader_skip_turn_answer: {data: {}, answer: {}};

    leader_punish_active_player: {data: {playerId: PlayerId}, answer: {scores: number}};
}

type GameActionKey = keyof ActionsMap;
interface GameAction<K extends GameActionKey = GameActionKey> {
    key: K;
    nonce: string;
    data: ActionsMap[K]["data"];
}

type ActionAnswer<K extends GameActionKey = GameActionKey> = {
    error: string;
} | {
    success: ActionsMap[K]["answer"];
}

type GameActionHandler<K extends GameActionKey = GameActionKey> = (data: GameAction<K>["data"]) => ActionAnswer<K>;