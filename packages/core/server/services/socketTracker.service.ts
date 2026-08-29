/**
 * @fileoverview Tracks active TCP sockets in a shared set and automatically
 * removes each socket when its connection closes.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { Socket } from "node:net";

export function trackSocket(openSockets: Set<Socket>, socket: Socket): void {
	openSockets.add(socket);
	socket.once("close", () => openSockets.delete(socket));
}
