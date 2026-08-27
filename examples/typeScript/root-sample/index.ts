import path from "node:path";
import { Subatom, cors, json, serveStatic } from "subatom";

const app = new Subatom();

app.use(cors());
app.use(json());

// 1. Mount static assets (serves public/index.html on root "/" if no explicit "/" route overrides it)
app.use(serveStatic("public"));

app.get("/", (req, res) =>{
  res.send("ok")
})


// 3. Register WebSocket endpoint with auth guard, rooms, and JSON messaging
app.ws<{ roomId: string }, { token?: string }>(
  "/chat/:roomId",
  {
    options: {
      allowOrigins: (origin) => !origin || origin.includes("localhost") || origin.includes("127.0.0.1"),
      verifyClient: async (req, info) => {
        const token = info.query.token;
        return token === "secret-token";
      },
    },
    onConnection: async (ws) => {
      const { roomId } = ws.params;
      ws.locals.username = `User-${ws.id.slice(0, 4)}`;

      // Join room and notify all active members
      ws.join(roomId);
      ws.broadcast(
        roomId,
        {
          type: "USER_JOINED",
          user: ws.locals.username,
        },
        false, // false ensures sender also receives confirmation
      );

      // Direct welcome message to connected socket
      ws.sendJson({ type: "WELCOME", id: ws.id, room: roomId });
    },
    onJson: async (ws, data) => {
      const { roomId } = ws.params;

      if (data.type === "CHAT_MESSAGE") {
        ws.broadcast(
          roomId,
          {
            type: "NEW_MESSAGE",
            sender: ws.locals.username,
            text: data.text,
          },
          false, // Delivers to both sender (User A) and all peers (User B, User C, etc.)
        );
      }
    },
    onClose: async (ws, code, reason) => {
      const { roomId } = ws.params;
      ws.broadcast(
        roomId,
        {
          type: "USER_LEFT",
          user: ws.locals.username,
          code,
          reason,
        },
        true, // Exclude closed socket
      );
    },
    onError: async (ws, error) => {
      console.error(`[Subatom WS] Error on connection ${ws.id}:`, error.message);
    },
  },
);

// 4. Route Group with WebSockets
app.group("/live").ws("/notifications", {
  onConnection: (ws) => {
    ws.sendJson({ type: "SYNC", timestamp: Date.now() });
  },
  onMessage: (ws, data, isBinary) => {
    if (!isBinary) {
      console.log(`[Subatom WS] Received message: ${data.toString()}`);
    }
  },
});

// 5. Start Server
app.start();

// 6. Graceful Shutdown
process.on("SIGINT", () => {
  app.gracefulShutdown(0);
});