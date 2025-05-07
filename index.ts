import express from "express";
import type { Request, Response } from "express";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";

const app = express();
const port = 3000;
const bindAddress = "0.0.0.0";
const server = http.createServer(app);

const wss = new WebSocketServer({ server });

let patty = 0;
let clicks = 1;

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.get("/", (req: Request, res: Response) => {
  res.status(200).json({ clicks: clicks, patty: patty });
});

app.post("/inc/patty", (req: Request, res: Response) => {
  patty++;
  wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ clicks: clicks, patty: patty }));
    }
  });
  res.status(200).json({ clicks: clicks });
});

app.post("/inc", (req: Request, res: Response) => {
  if (patty > 0) {
    patty--;
    clicks++;
    wss.clients.forEach((client: WebSocket) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ clicks: clicks, patty: patty }));
      }
    });
    res.status(200).json({ clicks: clicks });
  } else {
    res.status(400).json({ message: "not enough clicks!" });
  }
});

wss.on("connection", (ws: WebSocket) => {
  console.log("Client connected");

  ws.send(JSON.stringify({ clicks: clicks }));

  ws.on("message", (message: string) => {
    console.log(`Received message => ${message}`);
  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });

  ws.on("error", (error) => {
    console.error(`WebSocket error: ${error}`);
  });
});

server.listen(port, bindAddress, () => {
  console.log(`Server listening on ${bindAddress}:${port}`);
  console.log(`WebSocket server running on ws://${bindAddress}:${port}`);
});
