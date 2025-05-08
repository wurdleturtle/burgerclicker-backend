import express from "express";
import type { Request, Response } from "express";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import { MongoClient, Db, Collection } from "mongodb";
import dotenv from "dotenv";

dotenv.config(); // Load environment variables from .env file

const app = express();
const port = Number(process.env.PORT) || 3000;
const bindAddress = "0.0.0.0";
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error("Error: MONGODB_URI is not defined in .env file");
  process.exit(1);
}

let db: Db;
let gameStateCollection: Collection<GameState>;

interface GameState {
  _id?: string; // Optional: MongoDB will generate this
  clicks: number;
  patty: number;
  lastModified: Date;
}

const GAME_STATE_ID = "global"; // Use a single document for the global game state

async function connectToMongo() {
  try {
    const client = new MongoClient(mongoUri!);
    await client.connect();
    db = client.db(); // The DB name is part of the URI
    gameStateCollection = db.collection<GameState>("gameState");
    console.log("Successfully connected to MongoDB");

    // Initialize game state if it doesn't exist
    const existingState = await gameStateCollection.findOne({ _id: GAME_STATE_ID });
    if (!existingState) {
      await gameStateCollection.insertOne({
        _id: GAME_STATE_ID,
        clicks: 1,
        patty: 0,
        lastModified: new Date(),
      });
      console.log("Initial game state created in MongoDB.");
    }
  } catch (error) {
    console.error("Failed to connect to MongoDB", error);
    process.exit(1);
  }
}

async function getGameState(): Promise<GameState | null> {
  return gameStateCollection.findOne({ _id: GAME_STATE_ID });
}

async function updateGameState(updates: Partial<GameState>): Promise<GameState | null> {
  const result = await gameStateCollection.findOneAndUpdate(
    { _id: GAME_STATE_ID },
    { $set: { ...updates, lastModified: new Date() } },
    { returnDocument: "after", upsert: true } // upsert ensures it creates if not exists
  );
  return result;
}

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.get("/", async (req: Request, res: Response) => {
  try {
    const state = await getGameState();
    if (state) {
      res.status(200).json({ clicks: state.clicks, patty: state.patty });
    } else {
      res.status(404).json({ message: "Game state not found" });
    }
  } catch (error) {
    console.error("Error fetching game state:", error);
    res.status(500).json({ message: "Error fetching game state" });
  }
});

app.post("/inc/patty", async (req: Request, res: Response) => {
  try {
    const updatedState = await gameStateCollection.findOneAndUpdate(
      { _id: GAME_STATE_ID },
      { $inc: { patty: 1 }, $set: { lastModified: new Date() } },
      { returnDocument: "after", upsert: true }
    );

    if (updatedState) {
      wss.clients.forEach((client: WebSocket) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ clicks: updatedState.clicks, patty: updatedState.patty }));
        }
      });
      res.status(200).json({ clicks: updatedState.clicks, patty: updatedState.patty });
    } else {
      res.status(500).json({ message: "Failed to update patty count" });
    }
  } catch (error) {
    console.error("Error incrementing patty:", error);
    res.status(500).json({ message: "Error incrementing patty" });
  }
});

app.post("/inc", async (req: Request, res: Response) => {
  try {
    const currentState = await getGameState();
    if (currentState && currentState.patty > 0) {
      const updatedState = await gameStateCollection.findOneAndUpdate(
        { _id: GAME_STATE_ID },
        { $inc: { patty: -1, clicks: 1 }, $set: { lastModified: new Date() } },
        { returnDocument: "after" }
      );

      if (updatedState) {
        wss.clients.forEach((client: WebSocket) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ clicks: updatedState.clicks, patty: updatedState.patty }));
          }
        });
        res.status(200).json({ clicks: updatedState.clicks, patty: updatedState.patty });
      } else {
        // This case should ideally not happen if currentState.patty > 0 was true
        res.status(500).json({ message: "Failed to increment clicks" });
      }
    } else {
      res.status(400).json({ message: "Not enough patties!" }); // Changed message for clarity
    }
  } catch (error) {
    console.error("Error incrementing clicks:", error);
    res.status(500).json({ message: "Error incrementing clicks" });
  }
});

wss.on("connection", async (ws: WebSocket) => {
  console.log("Client connected");
  try {
    const state = await getGameState();
    if (state) {
      ws.send(JSON.stringify({ clicks: state.clicks, patty: state.patty }));
    } else {
       // Send initial default if not found, though connectToMongo should create it
      ws.send(JSON.stringify({ clicks: 1, patty: 0 })); 
    }
  } catch (error) {
    console.error("Error sending initial state to WebSocket client:", error);
    ws.send(JSON.stringify({ error: "Failed to load game state" }));
  }

  ws.on("message", (message: string) => {
    console.log(`Received message => ${message}`);
    // Handle incoming messages if needed for future scalability (e.g., specific client actions)
  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });

  ws.on("error", (error) => {
    console.error(`WebSocket error: ${error}`);
  });
});

async function startServer() {
  await connectToMongo();
  server.listen(port, bindAddress, () => {
    console.log(`Server listening on ${bindAddress}:${port}`);
    console.log(`WebSocket server running on ws://${bindAddress}:${port}`);
  });
}

startServer();
