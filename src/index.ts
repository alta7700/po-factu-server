import express, { Express, Request, Response } from "express";
import WebSocket, {Server} from "ws";
import dotenv from "dotenv";
dotenv.config();
import {generateRoomCode} from "./utils";
import Room from "./Room";
import TgBot from "./TgBot";
import path from "node:path";

const app: Express = express();
const port = process.env.PORT ? Number(process.env.PORT) : 5000;

app.use("/avatars", express.static(path.join(__dirname, "avatars")));

if (process.env.ALLOWED_ORIGINS) {
    app.use(require('cors')({
        origin: process.env.ALLOWED_ORIGINS.split(','),
        exposedHeaders: ["Connection", "Upgrade"]
    }));
}

app.post("/new", (_: Request, res: Response) => {
    const code = generateRoomCode((value) => value in rooms);
    rooms[code] = new Room(code, () => { delete rooms[code] });
    return res.status(200).send(code);
});

const server = app.listen(port, "0.0.0.0", () => {
    console.log(`[server]: Server is running at http://localhost:${port}`);
});

const wss = new Server({server, path: ""});

const rooms: Record<string, Room> = {}

wss.on("connection", (ws: WebSocket, req) => {
    const query = new URLSearchParams(req.url!.slice(req.url!.indexOf("?")));
    const user_id = Number(query.get("id") ?? undefined);
    const user_name = query.get("name");
    const room = query.get("room")?.toUpperCase();

    if (Number.isNaN(user_id) || !user_name || !room) {
        ws.close();
        return;
    }

    const roomInstance = rooms[room];
    let errorMessage;
    if (roomInstance) {
        errorMessage = roomInstance.connectPlayer(user_id, user_name, ws);
    } else {
        errorMessage = "Нет такой комнаты.";
    }
    if (errorMessage) {
        ws.send(JSON.stringify({type: "error_connection", reason: errorMessage}));
        ws.close();
    }
});
TgBot.updates.startPolling().then(() => {
    console.log("start polling")
})