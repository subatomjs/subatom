import type { Socket } from "node:net";

export function trackSocket(openSockets: Set<Socket>, socket: Socket): void {
	openSockets.add(socket);
	socket.once("close", () => openSockets.delete(socket));
}
