import WebSocket from "ws";
import Room from "./Room";
import assert from "node:assert";

export default class RoomPlayer {
    readonly id: PlayerId;
    readonly name: string;
    private _connection: WebSocket | null = null;
    photo: string | null;
    room: Room;

    constructor(id: PlayerId, name: string, connection: WebSocket, room: Room) {
        this.id = id;
        this.name = name;
        this._connection = connection;
        this.initConnection();
        this.photo = null;
        this.room = room;
    }

    sendString(data: string) {
        if (this.connected) {
            this._connection!.send(data);
        }
    }
    private sendAnswer(nonce: string, data: ActionAnswer) {
        this.sendString(JSON.stringify({type: "answer", nonce, data}));
    }

    get connected() {
        return !!this._connection && this._connection.readyState === WebSocket.OPEN;
    }

    get connection(): WebSocket | null {
        return this._connection;
    }
    set connection(value: WebSocket | null) {
        this._connection = value;
        if (this._connection) {
            this.initConnection();
            this.room.reconnectPlayer(this.id);
        } else {
            this.room.disconnectPlayer(this.id);
        }
    }
    initConnection() {
        assert(this._connection && this.connected);
        this._connection.on("close", () => {
            this.connection = null;
        });
        this._connection.on("message", (rawData: string) => {
            this.handleAction(JSON.parse(rawData) as GameAction);
        });
    }

    handleAction({key, nonce, data}: GameAction) {
        let result: ActionAnswer;
        try {
            result = this[`_action_${key}`](data as any);
        } catch (e) {
            if (e instanceof Error) {
                result = {error: e.message};
            } else {
                result = {error: (e as any).toString()};
            }
        }
        this.sendAnswer(nonce, result);
    }

    _action_send_ready_state: GameActionHandler<"send_ready_state"> = (data) => {
        const error = this.room.setPlayerReadyState(this.id, data.state);
        if (error) return {error};
        return {success: {state: data.state}};
    }

    _action_start_facts: GameActionHandler<"start_facts"> = () =>  {
        const error = this.room.startFacts(this.id);
        if (error) return {error};
        return {success: {}};
    }
    _action_fact_add: GameActionHandler<"fact_add"> = (data) => {
        const res = this.room.addFact(this.id, data.text);
        if (typeof res === "string") {
            return {error: res};
        } else {
            return {success: {fact: res}};
        }
    }
    _action_fact_drop: GameActionHandler<"fact_drop"> = () => {
        const error = this.room.dropFact(this.id);
        if (error) return {error};
        return {success: {}};
    }

    _action_start_about: GameActionHandler<"start_about"> = () => {
        const error = this.room.startAbout(this.id);
        if (error) return {error};
        return {success: {}};
    }

    _action_next_turn: GameActionHandler<"next_turn"> = () => {
        const res = this.room.nextTurn(this.id);
        if (typeof res === "string") return {error: res};
        return {success: {nextPlayerId: res}};
    }
    _action_leader_skip_turn: GameActionHandler<"leader_skip_turn"> = () => {
        const res = this.room.leaderNextTurn(this.id);
        if (typeof res === "string") return {error: res};
        return {success: {nextPlayerId: res}};
    }

    _action_change_candidates: GameActionHandler<"change_candidates"> = ({factId, players}) => {
        const error = this.room.changeFactCandidates(this.id, factId, players);
        if (error) return {error};
        return {success: {}};
    }

    _action_answer_send: GameActionHandler<"answer_send"> = ({answer}) => {
        const error = this.room.addAnswers(this.id, answer);
        if (error) return {error};
        return {success: {}};
    }
    _action_answer_drop: GameActionHandler<"answer_drop"> = () => {
        const error = this.room.dropAnswers(this.id);
        if (error) return {error};
        return {success: {}};
    }

    _action_finish_game: GameActionHandler<"finish_game"> = () => {
        const error = this.room.finishGame(this.id);
        if (error) return {error};
        return {success: {}};
    }

    toJSON(): Player {
        return {
            id: this.id,
            name: this.name,
            photo: this.photo,
            connected: this.connected,
        }
    }
}
