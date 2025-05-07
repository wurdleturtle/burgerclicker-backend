import express from "express";
import type { Request, Response } from "express";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";

const app = express();
const port = 3000;
const bindAddress = "0.0.0.0"; // <-- Listen on all network interfaces

// Create an HTTP server from your Express app
const server = http.createServer(app);

// Create a WebSocket server and attach it to the HTTP server
const wss = new WebSocketServer({ server });

let clicks = 1;

// Allow CORS for the frontend
app.use((req, res, next) => {
  // Allow requests from all origins on your LAN
  // You might need to be more specific if you have security concerns
  res.setHeader("Access-Control-Allow-Origin", "*"); // Allows all origins (use with caution in production)
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.get("/", (req: Request, res: Response) => {
  res.status(200).json({ clicks: clicks });
});

app.post("/inc", (req: Request, res: Response) => {
  clicks++;
  // Broadcast the new click count to all connected WebSocket clients
  wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ clicks: clicks }));
    }
  });
  res.status(200).json({ clicks: clicks });
});

// Handle WebSocket connections
wss.on("connection", (ws: WebSocket) => {
  console.log("Client connected");

  // Optionally send the current click count to the new client on connection
  ws.send(JSON.stringify({ clicks: clicks }));

  ws.on("message", (message: string) => {
    console.log(`Received message => ${message}`);
    // You could add logic here to handle messages from clients
  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });

  ws.on("error", (error) => {
    console.error(`WebSocket error: ${error}`);
  });
});

// Listen on the HTTP server on all network interfaces
server.listen(port, bindAddress, () => {
  // <-- Pass 0.0.0.0 here
  console.log(`Server listening on ${bindAddress}:${port}`);
  console.log(`WebSocket server running on ws://${bindAddress}:${port}`);
});
