import path from "node:path";
import {
  type IContext,
  type IWebSocketConnection,
  cors,
  json,
  Subatom,
} from "subatom";

const server = new Subatom();

server.setConfig({
  websocket: true,
  websocketOptions: {
    heartbeatIntervalMs: 30_000,
    maxMessagesPerSecond: 100,
    maxPayloadBytes: 1024 * 1024,
  },
});

server.use(json());
server.use(cors());

// Serve frontend HTML
server.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "public/index.html"));
});

// In-memory room occupancy tracking
const rooms = new Map<string, Set<string>>();

server.ws("/chat", {
  onConnection: (socket: IWebSocketConnection) => {
    console.log(`[WS Connected] Socket ID: ${socket.id}`);

    // Default the socket to a room immediately so messages are never dropped
    const defaultRoom = "general";
    socket.join(defaultRoom);
    socket.locals.room = defaultRoom;
    socket.locals.username = `User_${socket.id.slice(0, 4)}`;

    if (!rooms.has(defaultRoom)) {
      rooms.set(defaultRoom, new Set());
    }
    rooms.get(defaultRoom)!.add(socket.id);

    // Send immediate confirmation to connecting socket
    socket.send({
      type: "connected",
      id: socket.id,
      username: socket.locals.username,
      room: defaultRoom,
      message: "Connected to chat server",
    });
  },

  onMessage: (socket: IWebSocketConnection, data) => {
    try {
      // 1. Normalize data to string
      const raw =
        typeof data === "string"
          ? data
          : Buffer.isBuffer(data)
            ? data.toString("utf-8")
            : Buffer.from(data as ArrayBuffer).toString("utf-8");

      console.log(`[WS Received from ${socket.id}]:`, raw);

      // 2. Parse JSON or fall back to plain text message
      let msg: any;
      try {
        msg = JSON.parse(raw);
      } catch {
        msg = { type: "message", text: raw };
      }

      // Handle room joining
      if (msg.type === "join") {
        const targetRoom = msg.room || "general";
        const currentRoom = rooms.get(targetRoom) || new Set<string>();

        if (currentRoom.size >= 2 && !socket.rooms.has(targetRoom)) {
          socket.send({
            type: "error",
            message: "Room is full (Max 2 users allowed)",
          });
          return;
        }

        // Leave previous room if any
        if (socket.locals.room) {
          socket.leave(socket.locals.room);
          rooms.get(socket.locals.room)?.delete(socket.id);
        }

        socket.join(targetRoom);
        socket.locals.username = msg.username || socket.locals.username;
        socket.locals.room = targetRoom;

        if (!rooms.has(targetRoom)) {
          rooms.set(targetRoom, new Set());
        }
        rooms.get(targetRoom)!.add(socket.id);

        const memberCount = rooms.get(targetRoom)!.size;

        socket.send({
          type: "joined",
          room: targetRoom,
          userId: socket.id,
          username: socket.locals.username,
          members: memberCount,
        });

        // Broadcast to other peers in the room
        socket.broadcast(targetRoom, {
          type: "user_joined",
          username: socket.locals.username,
          members: memberCount,
        }, true);
        return;
      }

      // Handle chat message
      if (msg.type === "message" || msg.text) {
        const roomName = socket.locals.room || "general";
        const textContent = msg.text || raw;

        const payload = {
          type: "message",
          from: socket.locals.username,
          senderId: socket.id,
          text: textContent,
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        };

        // 1. Echo back to sender so 1-client tests receive feedback
        socket.send(payload);

        // 2. Broadcast to other peers in the room
        socket.broadcast(roomName, payload, true);
      }
    } catch (err) {
      console.error("[WS Message Error]:", err);
    }
  },

  onClose: (socket: IWebSocketConnection) => {
    console.log(`[WS Disconnected] Socket ID: ${socket.id}`);
    const roomName = socket.locals.room;
    if (roomName && rooms.has(roomName)) {
      const roomSet = rooms.get(roomName)!;
      roomSet.delete(socket.id);

      if (roomSet.size === 0) {
        rooms.delete(roomName);
      } else {
        socket.broadcast(roomName, {
          type: "user_left",
          username: socket.locals.username || "Peer",
          members: roomSet.size,
        }, true);
      }
    }
  },

  onError: (socket: IWebSocketConnection, error: Error) => {
    console.error(`[WS Error on ${socket.id}]:`, error.message);
  },
});

// Start listening on port 8080
void server.listen(8080, "0.0.0.0", "subatom-chat-server");

export default server;