interface Player {
    readonly id: number;
    readonly name: string;
    connected: boolean;
    knownFact: FactId | null;
    score: number;
}
type PlayerId = Player["id"];

interface Fact {
    readonly id: number;
    readonly text: string;
}
type FactId = Fact["id"];

interface CurrentTurn {
    playerId: PlayerId;
    factId?: FactId;
}

type GameStage = "waiting" | "facts" | "about" | "turns" | "final";
type RoomState<S extends GameStage = GameStage> = {
    stage: S;
    roomCode: string;
    leaderId: PlayerId;
    ownId: PlayerId;
    players: Player[];
} & ({
    waiting: {
        readyPlayers: PlayerId[];
    };
    facts: {
        ownFactId: FactId | null;
        facts: Fact[];
    };
    about: {
        ownFactId: FactId;
        facts: Fact[];
        currentTurn: CurrentTurn;
    };
    turns: {
        ownFactId: FactId;
        facts: Fact[];
        currentTurn: CurrentTurn;
    };
    final: {
        ownFactId: FactId;
        facts: Fact[];
    };
}[S]);
