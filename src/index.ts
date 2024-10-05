import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
import WebSocket, {Server} from "ws";
import {generateRoomCode} from "./utils";
import Room from "./Room";

dotenv.config();

const app: Express = express();
const port = process.env.PORT ? Number(process.env.PORT) : 5000;

if (process.env.DEBUG !== "false") {
    app.use(require('cors')());
}

app.post("/infact/new", (_: Request, res: Response) => {
    const code = generateRoomCode((value) => value in rooms);
    rooms[code] = new Room(code, () => { delete rooms[code] });
    return res.send(code);
});

const server = app.listen(port, "0.0.0.0", () => {
    console.log(`[server]: Server is running at http://localhost:${port}`);
});

const wss = new Server({server, path: "infact"});

const rooms: Record<string, Room> = {}

wss.on("connection", (ws: WebSocket, req) => {
    const { searchParams } = new URL(req.url!!);
    const user_id = Number(searchParams.get("id"));
    const user_name = searchParams.get("name");
    const room = searchParams.get("room")?.toUpperCase();

    if (isNaN(user_id) || !user_name || !room) {
        ws.close();
        return;
    }

    ws.on("open", () => {
        const roomInstance = rooms[room];
        if (roomInstance) {
            roomInstance.connectPlayer(user_id, user_name, ws);
        } else {
            ws.close();
        }
    })


    ws.on("message", (message: string) => {
        console.log(`Received message: ${message}`);
    });

    ws.on("error", () => {})

    ws.on("close", () => {
        console.log('Client disconnected');
    });
});