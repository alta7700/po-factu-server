interface ActionsMap {
    send_ready_state: {data: {state: boolean}, answer: {state: boolean}};

    start_facts: {data: {}, answer: {}};
    fact_add: {data: {text: string}, answer: {fact: Fact}};
    fact_drop: {data: {}, answer: {}};

    start_about: {data: {}, answer: {}};

    next_turn: {data: {}, answer: {nextPlayerId: number | null}};
    leader_skip_turn: {data: {}, answer: {nextPlayerId: number | null}};

    change_candidates: {data: {factId: FactId, players: PlayerId[]}, answer: {}};

    answer_send: {data: {answer: PlayerFinalAnswer}, answer: {}};
    answer_drop: {data: {}, answer: {}};

    finish_game: {data: {}, answer: {}};
}

type GameActionKey = keyof ActionsMap;
interface GameAction<K extends GameActionKey = GameActionKey> {
    key: K;
    nonce: string;
    data: ActionsMap[K]["data"];
}
