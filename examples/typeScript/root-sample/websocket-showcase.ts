import {
	type IContext,
	type IWebSocketConnection,
	SSEStream,
	Subatom,
} from "subatom";

// ============================================================================
// 1. STRONGLY-TYPED CONTRACTS (PARAMS, QUERY, LOCALS)
// ============================================================================
interface RoomParams extends Record<string, string | undefined> {
	roomId: string;
	channelId: string;
}

interface RoomQuery extends Record<string, string | undefined> {
	token?: string;
	debug?: string;
}

interface UserSessionLocals extends Record<string, any> {
	userId: string;
	username: string;
	role: "admin" | "member";
	authenticatedAt: number;
}

/** Utility to safely parse any incoming WebSocket data type into a UTF-8 string */
function decodeMessageData(data: unknown): string {
	if (typeof data === "string") return data;
	if (Buffer.isBuffer(data)) return data.toString("utf-8");
	if (Array.isArray(data)) return Buffer.concat(data).toString("utf-8");
	if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
		return Buffer.from(data as ArrayBuffer).toString("utf-8");
	}
	return String(data ?? "");
}

const app = new Subatom();

// Global framework configuration for WebSockets
app.setConfig({
	websocket: true,
	websocketOptions: {
		heartbeatIntervalMs: 30_000,
		maxConnections: 10_000,
		maxMessagesPerSecond: 50,
		maxPayloadBytes: 2 * 1024 * 1024, // 2MB
		backpressureLimitBytes: 1024 * 1024, // 1MB
		shutdownTimeoutMs: 5_000,
		perMessageDeflate: true,
	},
});

// ============================================================================
// 2. ROOT WEBSOCKET ROUTE WITH TYPED PARAMS, QUERY, AUTH & LOCALS
// ============================================================================
app.ws<RoomParams, RoomQuery, UserSessionLocals>(
	"/ws/rooms/:roomId/channels/:channelId",
	{
		options: {
			maxMessagesPerSecond: 50,
			// Allow query token or header auth
			verifyClient: async (req) => {
				const url = new URL(req.url ?? "/", "http://localhost");
				const token =
					url.searchParams.get("token") || req.headers.authorization;
				return Boolean(token && token.length > 0);
			},
		},

		onConnection: async (
			socket: IWebSocketConnection<RoomParams, RoomQuery, UserSessionLocals>,
		) => {
			const { roomId = "default", channelId = "main" } = socket.params;
			const connectionId = socket.id;

			socket.locals = {
				userId: `user_${connectionId.slice(0, 6)}`,
				username: `Guest_${connectionId.slice(0, 4)}`,
				role: roomId === "admin-room" ? "admin" : "member",
				authenticatedAt: Date.now(),
			};

			const roomNamespace = `room:${roomId}:${channelId}`;
			socket.join(roomNamespace);
			socket.join(`user:${socket.locals.userId}`);

			console.log(
				`[WS Connected] ID: ${socket.id} | Room: ${roomNamespace} | IP: ${socket.ip}`,
			);

			// Welcome message sent directly to connecting client
			socket.sendJson({
				type: "WELCOME",
				message: `Connected to room: "${roomId}", channel: "${channelId}"`,
				connectionId: socket.id,
				user: socket.locals.username,
				room: roomNamespace,
				timestamp: Date.now(),
			});

			// Notify other members in the room
			socket.broadcast(
				roomNamespace,
				{
					type: "USER_JOINED",
					user: socket.locals.username,
					room: roomNamespace,
				},
				true,
			);
		},

		onMessage: async (
			socket: IWebSocketConnection<RoomParams, RoomQuery, UserSessionLocals>,
			data,
			isBinary,
		) => {
			const { roomId = "default", channelId = "main" } = socket.params;
			const roomNamespace = `room:${roomId}:${channelId}`;

			// 1. Binary frames
			if (isBinary) {
				const buffer = Buffer.isBuffer(data)
					? data
					: Buffer.from(data as ArrayBuffer);
				console.log(`[WS Binary] Received ${buffer.byteLength} bytes`);
				// Echo binary back to sender
				socket.send(buffer);
				// Broadcast binary to other room members
				socket.broadcast(roomNamespace, buffer, true);
				return;
			}

			// 2. Text / JSON frames
			const rawText = decodeMessageData(data);
			console.log(`[WS Message Received] "${rawText}" from ${socket.id}`);

			let parsed: Record<string, any> | null = null;
			try {
				parsed = JSON.parse(rawText);
			} catch {
				// Handle plain text directly
				parsed = { action: "ECHO", text: rawText };
			}

			switch (parsed?.action) {
				case "CHAT_MESSAGE": {
					const chatPayload = {
						type: "NEW_MESSAGE",
						from: socket.locals.username,
						text: parsed.text || "",
						room: roomNamespace,
						timestamp: Date.now(),
					};

					// Acknowledge directly back to sender so 1-client tests see the response
					socket.sendJson({
						type: "MESSAGE_ACK",
						status: "delivered",
						message: chatPayload,
					});

					// Broadcast to all other connections in the room
					socket.broadcast(roomNamespace, chatPayload, true);
					break;
				}

				case "SWITCH_CHANNEL": {
					const nextChannel = String(parsed.targetChannel || "main");
					const oldNamespace = `room:${roomId}:${channelId}`;
					const nextNamespace = `room:${roomId}:${nextChannel}`;

					socket.leave(oldNamespace);
					socket.join(nextNamespace);

					socket.sendJson({
						type: "CHANNEL_SWITCHED",
						from: oldNamespace,
						to: nextNamespace,
					});
					break;
				}

				case "PING": {
					socket.sendJson({ type: "PONG", timestamp: Date.now() });
					break;
				}

				case "ECHO":
				default: {
					// Direct Echo back to sender
					socket.sendJson({
						type: "ECHO_RESPONSE",
						received: parsed?.text ?? rawText,
						from: socket.locals.username,
						timestamp: Date.now(),
					});
					break;
				}
			}
		},

		onClose: async (
			socket: IWebSocketConnection<RoomParams, RoomQuery, UserSessionLocals>,
			code: number,
			reason: string,
		) => {
			const { roomId = "default", channelId = "main" } = socket.params;
			const roomNamespace = `room:${roomId}:${channelId}`;

			console.log(`[WS Closed] ID: ${socket.id} (${code}: ${reason})`);

			socket.broadcast(
				roomNamespace,
				{
					type: "USER_LEFT",
					user: socket.locals.username,
					code,
					reason,
				},
				true,
			);

			socket.leaveAll();
		},

		onError: async (
			socket: IWebSocketConnection<RoomParams, RoomQuery, UserSessionLocals>,
			error: Error,
		) => {
			console.error(
				`[WS Error] Socket ${socket.id} error:`,
				error.message,
			);
		},
	},
);

// ============================================================================
// 3. ROUTE GROUP REAL-TIME NOTIFICATIONS
// ============================================================================
interface OrgParams extends Record<string, string | undefined> {
	orgId: string;
}

app.group("/org/:orgId")
	.prefix("/realtime")
	.ws<OrgParams>("/notifications", {
		onConnection: (socket) => {
			const { orgId = "default" } = socket.params;
			socket.join(`org:${orgId}`);
			socket.sendJson({
				type: "NOTIFICATION_CONNECTED",
				status: `Subscribed to organization: ${orgId}`,
			});
		},
		onMessage: (socket, data) => {
			const { orgId = "default" } = socket.params;
			const text = decodeMessageData(data);
			// Echo back to sender + broadcast
			socket.sendJson({ type: "NOTIFICATION_ACK", text });
			socket.broadcast(`org:${orgId}`, { type: "ORG_BROADCAST", text }, true);
		},
	});

// ============================================================================
// 4. HTTP-TO-WEBSOCKET BRIDGE
// ============================================================================
app.post("/api/admin/broadcast", {
	controller: async (ctx: IContext) => {
		const { message, room } = (ctx.body as {
			message: string;
			room?: string;
		}) || { message: "System Ping" };

		const wsManager = (ctx.req as any).raw?.socket?.server?.webSocket;

		if (wsManager && wsManager.isActive) {
			if (room) {
				wsManager.broadcastTo(room, {
					type: "ADMIN_ALERT",
					text: message,
					timestamp: Date.now(),
				});
			} else {
				wsManager.broadcast({
					type: "SYSTEM_WIDE_ALERT",
					text: message,
					timestamp: Date.now(),
				});
			}

			ctx.json({
				success: true,
				deliveredTo: room ?? "ALL",
				totalConnections: wsManager.connectionCount,
			});
			return;
		}

		ctx.status(503).json({ error: "WebSocket manager is inactive" });
	},
});

// ============================================================================
// 5. SERVER-SENT EVENTS
// ============================================================================
app.get("/events/live-feed", {
	controller: async (ctx: IContext) => {
		const sse = new SSEStream(ctx.res.rawResponse, {
			heartbeatInterval: 10_000,
			retry: 5_000,
			headers: { "Access-Control-Allow-Origin": "*" },
		});

		void sse.send({
			event: "connected",
			data: { message: "SSE stream established" },
			id: "1",
		});

		const timer = setInterval(() => {
			if (sse.closed) {
				clearInterval(timer);
				return;
			}
			void sse.send({
				event: "metrics",
				data: { timestamp: new Date().toISOString() },
			});
		}, 3_000);

		sse.onClose(() => clearInterval(timer));
	},
});

// ============================================================================
// 6. SERVER BOOTSTRAP
// ============================================================================
async function bootstrap() {
	await app.listen(8080, "0.0.0.0", "subatom-ws-app");
}

void bootstrap();