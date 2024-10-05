class PlayerFact {
    id: FactId;
    text: string;
    ownerId: PlayerId;

    constructor(id: FactId, text: string, ownerId: PlayerId) {
        this.id = id;
        this.text = text;
        this.ownerId = ownerId;
    }

    toJSON(): Fact {
        return {
            id: this.id,
            text: this.text,
        }
    }
}