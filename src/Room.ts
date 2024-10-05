import assert from "node:assert";
import WebSocket from "ws";
import RoomPlayer from "./RoomPlayer";
import {getRandomValue} from "./utils";
import {DROP_REWARD_SCORES, MISTAKE_PUNISHMENT_SCORES, SAME_QUESTION_PUNISHMENT_SCORES} from "./constants";

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
    currentTurn: Required<CurrentTurn>;

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
        this.currentTurn = {playerId: -1, factId: -1};
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
        return this.players.find(p => p.id !== id);
    }

    private filterPlayers(filters: PlayerFilters): RoomPlayer[] {
        let players = [...this.players];
        if (filters.include) {
            players = players.filter(p => filters.include!.includes(p.id));
        }
        if (filters.exclude) {
            players = players.filter(p => !filters.include!.includes(p.id));
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
        if (!this.players.every(p => this.readyPlayers.includes(p.id))) {
            return "Не все игроки готовы.";
        }
        if (this.players.length < 4) {
            return "Должно быть не меньше 4 игроков.";
        }
        this.stage = "facts";
        this.sendEvent("start_facts", {}, {exclude: [playerId]});
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
        this.sendEvent("start_about", {}, {exclude: [playerId]});
        this.sendRoomState();
        this.setNextTurn();
    }
    startTurns() {
        assert(this.stage === "about");
        this.stage = "turns";
        this.sendEvent("start_turns", {});
        this.sendRoomState();
    }
    finishGame() {
        assert(this.stage === "turns");
        this.stage = "final";
        this.players.forEach(p => {p.dropped = true});
        this.sendEvent("finish_game", {});
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
            currentTurn: this.currentTurn.playerId === playerId
                ? {...this.currentTurn}
                : {playerId: this.currentTurn.playerId},
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
            currentTurn: this.currentTurn.playerId === playerId
                ? {...this.currentTurn}
                : {playerId: this.currentTurn.playerId},
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
            case "final":
                return this.getFinalRoomState(playerId);
        }
    }

    connectPlayer(id: PlayerId, name: string, connection: WebSocket): string | undefined {
        let player = this.getPlayer(id);
        if (player) {
            player.connection = connection;
        } else {
            if (this.stage !== "waiting") {
                return "Невозможно присоединиться к этой комнате, игра уже началась.";
            }
            player = new RoomPlayer(id, name, connection, this)
            this.addPlayer(player);
        }
        this.sendRoomState({include: [player.id]});
        this.dropAutoCloseTimer();
    }
    reconnectPlayer(playerId: PlayerId) {
        assert(this.players.find(p => p.id));
        this.sendEvent("player_reconnect", {playerId: playerId}, {exclude: [playerId]});
    }
    disconnectPlayer(playerId: PlayerId) {
        if (this.stage === "waiting") {
            const idx = this.players.findIndex(p => p.id === playerId);
            if (idx !== -1) return;
            const [playerToExclude] = this.players.splice(idx, 1);
            if (this.leaderId === playerToExclude.id) {
                this.setLeader(-1);
            }
            this.sendEvent("player_exclude", {playerId: playerToExclude.id});
        }
        this.players.find(p => p.id === playerId);
        this.sendEvent("player_disconnect", {playerId: playerId}, {exclude: [playerId]});
        if (!this.players.some(p => p.connected)) {
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
        if (this.stage === "waiting"){
            return "Игра уже начата, действие невозможно.";
        }
        const idx = this.readyPlayers.indexOf(playerId);
        if (state) {
            if (idx !== -1) {
                this.readyPlayers.splice(idx, 1);
            }
        } else {
            if (this.readyPlayers.includes(playerId)) {
                this.readyPlayers.push(playerId);
            }
        }
        this.sendEvent("player_ready_state", {playerId, state});
    }
    setLeader(playerId: PlayerId) {
        if (playerId === -1) {
            if (this.players.length > 0) {
                playerId = this.players[0].id;
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
        this.sendEvent("fact_drop", {factId: factToDrop.id});
    }
    getPlayerFact(playerId: PlayerId): Fact | null {
        return this.facts.find(f => f.ownerId === playerId) ?? null;
    }

    private getNextActivePlayer(playerId: PlayerId): PlayerId {
        if (playerId === -1) {
            playerId = this.players.at(-1)!.id;
        }
        const currentIndex = this.players.findIndex(player => player.id === playerId);
        // Итерация по кругу, начиная с текущего индекса
        const playersCount = this.players.length;
        for (let i = 1; i < playersCount; i++) {
            const nextIndex = (currentIndex + i) % playersCount; // Используем модуль для зацикливания
            const nextPlayer = this.players[nextIndex];

            // Проверяем, соответствует ли игрок условиям (connected && dropped)
            if (nextPlayer.connected && nextPlayer.dropped) {
                return nextPlayer.id;
            }
        }
        return playerId;
    }
    private chooseRandomFact(exclude: FactId[]): FactId {
        const availableFacts = this.facts.filter(f => {
            return !exclude.includes(f.id) && !this.getPlayer(f.ownerId)!.dropped;
        }).map(f => f.id);
        return getRandomValue(availableFacts);
    }
    setNextTurn() {
        assert(this.stage === "turns" || this.stage === "about");
        if (this.players.filter(p => p.connected && p.dropped).length < 3) {
            return this.finishGame();
        }
        const nextPlayerId = this.getNextActivePlayer(this.currentTurn.playerId);
        const nextFactID = this.chooseRandomFact([this.currentTurn.factId, this.getPlayerFact(nextPlayerId)!.id]);
        this.currentTurn = {
            playerId: nextPlayerId,
            factId: nextFactID,
        }
        this.turnsCount += 1;
        if (this.stage === "about" && this.turnsCount > this.players.length * 2) {
            this.startTurns();
        } else {
            this.sendEvent("turn_new", {playerId: this.currentTurn.playerId}, {exclude: [this.currentTurn.playerId]});
            this.sendEvent("turn_new", {...this.currentTurn}, {include: [this.currentTurn.playerId]});
        }
    }
    answerTurn(playerId: PlayerId, ownerId: PlayerId): string | {guess: boolean, scores: number} {
        assert(this.stage === "turns")
        if (this.currentTurn.playerId !== playerId) {
            return "Сейчас не Ваш ход.";
        }
        const owner = this.getPlayer(ownerId)!;
        if (owner.dropped) {
            return "Факт об этом игроке уже отгадан.";
        }
        const ownerFact = this.getPlayerFact(ownerId)!;
        const currentFact = this.facts.find(f => f.id === this.currentTurn.factId)!;

        let res: {guess: boolean, scores: number};
        if (ownerFact.id === currentFact.id) {
            owner.dropped = true;
            this.getPlayer(playerId)!.score += DROP_REWARD_SCORES;
            this.sendEvent("player_dropped", {
                playerId: ownerId,
                factId: currentFact.id,
                byPlayerId: playerId,
                score: DROP_REWARD_SCORES,
            }, {exclude: [playerId]});
            res = {guess: true, scores: DROP_REWARD_SCORES};
        } else {
            this.getPlayer(playerId)!.score -= MISTAKE_PUNISHMENT_SCORES;
            this.sendEvent("answer_mistake", {
                playerId: playerId,
                factId: currentFact.id,
                ownerId: owner.id,
                score: MISTAKE_PUNISHMENT_SCORES,
            }, {exclude: [playerId]})
            res = {guess: false, scores: MISTAKE_PUNISHMENT_SCORES};
        }
        this.setNextTurn();
        return res;
    }
    skipTurn(playerId: PlayerId): string | undefined {
        assert(this.stage === "turns");
        if (this.currentTurn.playerId !== playerId) {
            return "Невозможно пропустить, это не Ваш ход.";
        }
        this.setNextTurn();
    }
    leaderSkipTurn(playerId: PlayerId) {
        assert(this.stage === "turns")
        if (this.leaderId !== playerId) {
            return "Только лидер может пропустить чужой ход.";
        }
        this.setNextTurn();
    }

    punishActivePlayer(playerId: PlayerId, punishedPlayerId: PlayerId): string | number {
        assert(this.stage === "turns");
        if (this.leaderId !== playerId) {
            return "Эта функция только для лидера.";
        }
        if (this.currentTurn.playerId !== punishedPlayerId) {
            return "Не тот игрок:)";
        }
        this.getPlayer(punishedPlayerId)!.score -= SAME_QUESTION_PUNISHMENT_SCORES;
        this.sendEvent(
            "player_punished",
            {playerId: punishedPlayerId, scores: SAME_QUESTION_PUNISHMENT_SCORES},
            {exclude: [playerId]},
        );
        this.setNextTurn();
        return SAME_QUESTION_PUNISHMENT_SCORES;
    }
}
