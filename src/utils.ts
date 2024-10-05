export function generateRoomCode(codeExistenceCheck: (value: string) => boolean): string {
    let code = "";
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const charactersLength = characters.length;
    for (let i = 0; i < 4; i++) {
        code += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    if (codeExistenceCheck(code)) {
        return generateRoomCode(codeExistenceCheck);
    }
    return code;
}

export function getRandomValue<T>(values: T[]): T {
    return values[Math.floor(Math.random() * values.length)];
}
