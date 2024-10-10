import assert from "node:assert";
import WebSocket from "ws";
import RoomPlayer from "./RoomPlayer";
import PlayerFact from "./PlayerFact";
import {GUESSED_OFFS, GUESSING_REWARD} from "./constants";

interface PlayerFilters {
    include?: PlayerId[];
    exclude?: PlayerId[];
}
function pickFilters(filters?: PlayerFilters) {
    return {include: filters?.include, exclude: filters?.exclude};
}
interface SendOptions extends PlayerFilters {}

export default class Room {
    stage: GameStage;
    code: string;
    leaderId: PlayerId;
    players: RoomPlayer[];
    readyPlayers: PlayerId[];
    facts: PlayerFact[];
    factIdSeq: number;

    turnsCount: number;
    currentTurn: PlayerId;

    cycleNum: number;
    candidatesMap: Record<PlayerId, [FactId, PlayerId[]][]>;

    playerAnswers: Partial<Record<PlayerId, PlayerFinalAnswer>>;

    resultTable: [PlayerId, number][];
    guesses: {playerId: PlayerId, factId: FactId, guessedBy: PlayerId[]}[];

    onClose: () => void;
    autoCloseTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(code: string, onClose: () => void) {
        this.stage = "waiting";
        this.code = code;
        this.players = [];
        this.readyPlayers = [];
        this.leaderId = -1;
        this.onClose = onClose;
        this.facts = [];
        this.factIdSeq = 1;
        this.turnsCount = 0;
        this.currentTurn = -1;
        this.cycleNum = 0;
        this.candidatesMap = {};
        this.playerAnswers = {};
        this.resultTable = [];
        this.guesses = [];
        this.autoClose(60);
    }
    autoClose(sec: number) {
        this.dropAutoCloseTimer();
        this.autoCloseTimer = setTimeout(() => {
            if (this.players.length === 0) this.onClose();
        }, sec * 1000);
    }
    dropAutoCloseTimer() {
        if (this.autoCloseTimer !== null) clearTimeout(this.autoCloseTimer);
    }

    getPlayer(id: PlayerId): RoomPlayer | undefined {
        return this.players.find(p => p.id === id);
    }

    private filterPlayers(filters: PlayerFilters): RoomPlayer[] {
        let players = [...this.players];
        if (filters.include) {
            players = players.filter(p => filters.include!.includes(p.id));
        }
        if (filters.exclude) {
            players = players.filter(p => !filters.exclude!.includes(p.id));
        }
        return players;
    }

    private sendString(data: string, options?: SendOptions) {
        this.filterPlayers(pickFilters(options)).forEach(p => p.sendString(data));
    }
    private sendEvent<K extends GameEventKey>(key: K, data: GameEvent<K>["data"], options?: SendOptions) {
        this.sendString(JSON.stringify({type: "event", key, data}), options);
    }
    private sendRoomState(options?: Pick<SendOptions, "include" | "exclude">) {
        this.filterPlayers(pickFilters(options)).forEach(p => {
            const event: GameEvent<"room_state_load"> = {
                key: "room_state_load",
                data: {state: this.getRoomState(p.id)},
            }
            p.sendString(JSON.stringify({type: "event", ...event}));
        });
    }

    startFacts(playerId: PlayerId): string | undefined {
        if (this.leaderId !== playerId) {
            return "Начать игру может только лидер комнаты";
        }
        if (this.stage !== "waiting") {
            return "Ввод фактов уже начался.";
        }
        if (!this.players.every(p => this.leaderId === p.id || this.readyPlayers.includes(p.id))) {
            return "Не все игроки готовы.";
        }
        if (this.players.length < 4) {
            return "Должно быть не меньше 4 игроков.";
        }
        this.stage = "facts";
        this.sendRoomState();
    }

    startAbout(playerId: PlayerId): string | undefined {
        if (this.leaderId !== playerId) {
            return "Начать игру может только лидер комнаты.";
        }
        if (this.stage !== "facts") {
            return "Игра уже началась.";
        }
        const playersWithFact = this.facts.map(f => f.ownerId);
        if (!this.players.every(p => playersWithFact.includes(p.id))) {
            return "Не все игроки ввели факт";
        }
        this.stage = "about";
        this.candidatesMap = Object.fromEntries(this.players.map(p =>
            [p.id, this.facts.filter(f => f.ownerId !== p.id).map(f => [f.id, []])]
        ))
        this.setNextTurn();
        this.sendRoomState();
    }
    startTurns() {
        assert(this.stage === "about");
        this.stage = "turns";
        this.setNextTurn();
        this.sendRoomState();
    }
    startAnswers() {
        assert(this.stage === "turns");
        this.stage = "answers";
        this.sendRoomState();
    }
    finishGame(playerId: PlayerId): string | undefined {
        assert(this.stage === "answers");
        if (this.leaderId !== playerId) {
            return "Завершить игру может только лидер комнаты.";
        }
        if (!this.players.every(p => p.id in this.playerAnswers)) {
            return "Ещё не все отправили свои ответы."
        }
        this.stage = "final";
        this.resultTable = this.players.map(p => [
            p.id,
            this.playerGuesses(p.id).length * GUESSING_REWARD - this.playerGuessedBy(p.id).length * GUESSED_OFFS],
        );
        this.guesses = this.players.map(p => ({
            playerId: p.id,
            factId: this.getPlayerFact(p.id)!.id,
            guessedBy: this.playerGuessedBy(p.id),
        }))
        this.sendRoomState();
    }

    getWaitingRoomState(playerId: PlayerId): RoomState<"waiting"> {
        assert(this.stage === "waiting");
        return {
            stage: this.stage,
            roomCode: this.code,
            leaderId: this.leaderId,
            ownId: playerId,
            players: this.players.map(p => p.toJSON()),
            readyPlayers: this.readyPlayers,
        };
    }
    getFactsRoomState(playerId: PlayerId): RoomState<"facts"> {
        assert(this.stage === "facts");
        return {
            stage: this.stage,
            roomCode: this.code,
            leaderId: this.leaderId,
            ownId: playerId,
            players: this.players.map(p => p.toJSON()),
            ownFactId: this.getPlayerFact(playerId)?.id ?? null,
            facts: this.facts.map(f => f.toJSON()),
        };
    }
    getAboutRoomState(playerId: PlayerId): RoomState<"about"> {
        assert(this.stage === "about");
        return {
            stage: this.stage,
            roomCode: this.code,
            leaderId: this.leaderId,
            ownId: playerId,
            players: this.players.map(p => p.toJSON()),
            ownFactId: this.getPlayerFact(playerId)!.id,
            facts: this.facts.map(f => f.toJSON()),
            currentTurn: this.currentTurn,
        };
    }
    getTurnsRoomState(playerId: PlayerId): RoomState<"turns"> {
        assert(this.stage === "turns");
        return {
            stage: this.stage,
            roomCode: this.code,
            leaderId: this.leaderId,
            ownId: playerId,
            players: this.players.map(p => p.toJSON()),
            ownFactId: this.getPlayerFact(playerId)!.id,
            facts: this.facts.map(f => f.toJSON()),
            currentTurn: this.currentTurn,
            candidates: this.candidatesMap[playerId],
        };
    }
    getAnswersRoomState(playerId: PlayerId): RoomState<"answers"> {
        assert(this.stage === "answers");
        return {
            stage: this.stage,
            roomCode: this.code,
            leaderId: this.leaderId,
            ownId: playerId,
            players: this.players.map(p => p.toJSON()),
            ownFactId: this.getPlayerFact(playerId)!.id,
            facts: this.facts.map(f => f.toJSON()),
            candidates: this.candidatesMap[playerId],
            answer: this.playerAnswers[playerId] ?? null,
            answersSent: Object.keys(this.playerAnswers).map(Number)
        };
    }
    getFinalRoomState(playerId: PlayerId): RoomState<"final"> {
        assert(this.stage === "final");
        return {
            stage: this.stage,
            roomCode: this.code,
            leaderId: this.leaderId,
            ownId: playerId,
            players: this.players.map(p => p.toJSON()),
            ownFactId: this.getPlayerFact(playerId)!.id,
            facts: this.facts.map(f => f.toJSON()),
            result: {
                ownAnswer: this.playerAnswers[playerId]!,
                rightAnswer: this.facts.map(f => [f.id, f.ownerId]),
                guesses: this.guesses,
                resultTable: this.resultTable,
            }
        };
    }

    getRoomState(playerId: PlayerId): RoomState {
        switch (this.stage) {
            case "waiting":
                return this.getWaitingRoomState(playerId);
            case "facts":
                return this.getFactsRoomState(playerId);
            case "about":
                return this.getAboutRoomState(playerId);
            case "turns":
                return this.getTurnsRoomState(playerId);
            case "answers":
                return this.getAnswersRoomState(playerId);
            case "final":
                return this.getFinalRoomState(playerId);
        }
    }

    connectPlayer(id: PlayerId, name: string, connection: WebSocket): string | undefined {
        let player = this.getPlayer(id);
        if (player) {
            if (player.connected) {
                return "Пользователь с таким id уже подключен с другого устройства.";
            }
            player.connection = connection;
        } else {
            if (this.stage !== "waiting") {
                return "Невозможно присоединиться к этой комнате, игра уже началась.";
            }
            player = new RoomPlayer(id, name, connection, this)
            this.addPlayer(player);
        }
        this.sendRoomState({include: [player.id]});
        if (this.leaderId === -1) {
            this.setLeader(-1);
        }
        this.dropAutoCloseTimer();
    }
    reconnectPlayer(playerId: PlayerId) {
        assert(this.players.find(p => p.id));
        this.sendEvent("player_reconnect", {playerId: playerId}, {exclude: [playerId]});
    }
    disconnectPlayer(playerId: PlayerId) {
        if (this.stage === "waiting") {
            const idx = this.players.findIndex(p => p.id === playerId);
            if (idx === -1) return;
            const [playerToExclude] = this.players.splice(idx, 1);
            const readyPlayerIdx = this.readyPlayers.findIndex(id => id === playerToExclude.id);
            if (readyPlayerIdx !== -1) {
                this.readyPlayers.splice(readyPlayerIdx, 1);
            }
            this.sendEvent("player_exclude", {playerId: playerToExclude.id});
        }
        if (this.leaderId === playerId) {
            this.setLeader(-1);
        }
        this.players.find(p => p.id === playerId);
        this.sendEvent("player_disconnect", {playerId: playerId}, {exclude: [playerId]});
        if (this.players.length === 0 || this.players.every(p => !p.connected)) {
            this.autoClose(300);
        }
    }
    addPlayer(player: RoomPlayer) {
        assert(this.stage === "waiting");
        this.players.push(player);
        this.sendEvent("player_new", {player: player.toJSON()}, {exclude: [player.id]});
        if (this.leaderId === -1) {
            this.setLeader(player.id);
        }
    }
    setPlayerReadyState(playerId: PlayerId, state: boolean): string | undefined {
        if (this.stage !== "waiting"){
            return "Игра уже начата, действие невозможно.";
        }
        const idx = this.readyPlayers.indexOf(playerId);
        if (state) {
            if (!this.readyPlayers.includes(playerId)) {
                this.readyPlayers.push(playerId);
            }
        } else {
            if (idx !== -1) {
                this.readyPlayers.splice(idx, 1);
            }
        }
        this.sendEvent("player_ready_state", {playerId, state}, {exclude: [playerId]});
    }
    setLeader(playerId: PlayerId) {
        if (playerId === -1) {
            if (this.players.length > 0) {
                playerId = this.players.find(p => p.connected)?.id ?? -1;
            }
        }
        this.leaderId = playerId;
        if (this.leaderId !== -1) {
            this.sendEvent("leader_switch", {playerId: this.leaderId});
        }
    }

    addFact(playerId: PlayerId, text: string): string | Fact {
        if (this.stage !== "facts") {
            return "Сейчас нельзя добавить факт.";
        }
        if (this.facts.find(f => f.ownerId === playerId)) {
            return "Факт добавлен, сначала удалите текущий.";
        }
        const newFact = new PlayerFact(this.factIdSeq, text, playerId);
        this.factIdSeq += 1;
        this.facts.push(newFact);
        this.sendEvent("fact_new", {fact: newFact.toJSON()}, {exclude: [playerId]});
        return newFact.toJSON();
    }
    dropFact(playerId: PlayerId): string | undefined {
        if (this.stage !== "facts") {
            return "Сейчас нельзя добавить факт.";
        }
        const idx = this.facts.findIndex(f => f.ownerId === playerId);
        if (idx === -1) {
            return "Нечего сбрасывать:)";
        }
        const [factToDrop] = this.facts.splice(idx, 1);
        this.sendEvent("fact_drop", {factId: factToDrop.id}, {exclude: [playerId]});
    }
    getPlayerFact(playerId: PlayerId): PlayerFact | null {
        return this.facts.find(f => f.ownerId === playerId) ?? null;
    }

    private setNextTurn() {
        assert(this.stage === "about" || this.stage === "turns");
        // если -1, то будет 0 (логично, первый игрок), иначе берем следующего игрока
        const nextTurnIndex = this.players.findIndex(p => p.id === this.currentTurn) + 1
        let nextPlayer = this.players[nextTurnIndex];
        // круг закончился
        if (nextPlayer === undefined) {
            if (this.stage === "about") {
                return this.startTurns();
            }
            this.cycleNum += 1;
            if (this.cycleNum > 4) {
                return this.startAnswers();
            } else {
                nextPlayer = this.players[0];
            }
        }
        this.currentTurn = nextPlayer.id;
    }

    nextTurn(playerId: PlayerId): string | number | null {
        assert(this.stage === "about" || this.stage === "turns");
        if (this.currentTurn !== playerId) {
            return "Сейчас не Ваш ход!";
        }
        const stageBefore = this.stage;
        this.setNextTurn();
        if (stageBefore === this.stage) {
            this.sendEvent("turn_new", {playerId: this.currentTurn}, {exclude: [playerId]});
            return this.currentTurn;
        }
        return null;
    }
    leaderNextTurn(playerId: PlayerId): string | number | null {
        assert(this.stage === "about" || this.stage === "turns");
        if (this.leaderId !== playerId) {
            return "Только лидер может пропустить чужой ход.";
        }
        const stageBefore = this.stage;
        this.setNextTurn();
        if (stageBefore === this.stage) {
            this.sendEvent("turn_new", {playerId: this.currentTurn}, {exclude: [playerId]});
            return this.currentTurn;
        }
        return null;
    }

    changeFactCandidates(playerId: PlayerId, factId: FactId, candidates: PlayerId[]): string | undefined {
        assert(this.stage === "turns" || this.stage === "answers");
        if (this.getPlayerFact(playerId)!.id === factId) {
            return "Это же Ваш факт:)";
        }

        const playerIds = this.players.map(p => p.id);
        if (!candidates.every(id => playerIds.includes(id))) {
            return "Тут есть несуществующие игроки!";
        }

        const factCandidates = this.candidatesMap[playerId].find(([f]) => f === factId);
        if (factCandidates === undefined) {
            return "Не нашёл такого факта:(";
        }

        factCandidates[1] = candidates;
    }

    addAnswers(playerId: PlayerId, answer: PlayerFinalAnswer): string | undefined {
        assert(this.stage === "answers");
        if (playerId in this.playerAnswers) {
            return "Ответ уже отправлен";
        }
        const allAnswerFacts = answer.map(([factId, ]) => factId);
        const allAnswerPlayers = answer.map(([, playerId]) => playerId);
        if (new Set(allAnswerFacts).size !== allAnswerFacts.length) {
            return "Факты в ответе неуникальны.";
        } else if (!this.facts.every(f => f.ownerId === playerId || allAnswerFacts.includes(f.id))) {
            return "В ответе присутствуют не все факты";
        } else if (new Set(allAnswerPlayers).size !== allAnswerPlayers.length) {
            return "Игроки в ответе неуникальны.";
        } else if (!this.players.every(p => p.id === playerId || allAnswerPlayers.includes(p.id))) {
            return "В ответе присутствуют не все игроки";
        }
        this.playerAnswers[playerId] = answer;
        this.sendEvent("answer_sent", {playerId}, {exclude: [playerId]});
    }
    dropAnswers(playerId: PlayerId): string | undefined {
        assert(this.stage === "answers");
        if (!(playerId in this.playerAnswers)) {
            return "Ответ ещё не отправлен";
        }
        delete this.playerAnswers[playerId];
        this.sendEvent("answer_drop", {playerId}, {exclude: [playerId]});
    }

    private playerGuessedBy(playerId: PlayerId): PlayerId[] {
        const playerFactId = this.getPlayerFact(playerId)!.id;
        return this.players.filter(p => {
            if (p.id === playerId) {
                return false;
            }
            const answer = this.playerAnswers[p.id]!;
            const factAnswer = answer.find(([factId]) => factId === playerFactId)!;
            return factAnswer[1] === playerId;
        }).map(p => p.id)
    }
    private playerGuesses(playerId: PlayerId): PlayerId[] {
        return this.playerAnswers[playerId]!
            .filter(([factId, supposedPlayerId]) => factId === this.getPlayerFact(supposedPlayerId)!.id)
            .map(([, supposedPlayerId]) => supposedPlayerId);
    }
}
