// /subatom/package/core/bootstrap/subatom-server/services/socketTracker.service.ts
import type { Socket } from "node:net";

export function trackSocket(openSockets: Set<Socket>, socket: Socket): void {
	openSockets.add(socket);
	socket.once("close", () => openSockets.delete(socket));
}
