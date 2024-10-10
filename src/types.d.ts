interface Player {
    readonly id: number;
    readonly name: string;
    connected: boolean;
}
type PlayerId = Player["id"];

interface Fact {
    readonly id: number;
    readonly text: string;
}
type FactId = Fact["id"];

type PlayerFinalAnswer = [FactId, PlayerId][];

interface PlayerFinalResult {
    ownAnswer: PlayerFinalAnswer;
    rightAnswer: PlayerFinalAnswer;
    guesses: {playerId: PlayerId, factId: FactId, guessedBy: PlayerId[]}[];
    resultTable: [PlayerId, number][];
}

type GameStage = "waiting" | "facts" | "about" | "turns" | "answers" | "final";
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
        currentTurn: PlayerId;
    };
    turns: {
        ownFactId: FactId;
        facts: Fact[];
        currentTurn: PlayerId;
        candidates: [FactId, PlayerId[]][];
    };
    answers: {
        ownFactId: FactId;
        facts: Fact[];
        candidates: [FactId, PlayerId[]][];
        answer: PlayerFinalAnswer | null;
        answersSent: PlayerId[];
    }
    final: {
        ownFactId: FactId;
        facts: Fact[];
        result: PlayerFinalResult;
    };
}[S]);

type ActionAnswer<K extends GameActionKey = GameActionKey> = {
    error: string;
} | {
    success: ActionsMap[K]["answer"];
}

type GameActionHandler<K extends GameActionKey = GameActionKey> = (data: GameAction<K>["data"]) => ActionAnswer<K>;
