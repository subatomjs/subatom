/// <reference types="node" />
import { describe, expect, it } from "vitest";
import type { Socket } from "node:net";
import { EventEmitter } from "node:events";
import { trackSocket } from "../../../../../packages/core/server/services/socketTracker.service.js";

describe("socketTracker.service", () => {
	it("should add socket to set and delete it when close event fires", () => {
		const openSockets = new Set<Socket>();
		const socketEmitter = new EventEmitter();
		const mockSocket = socketEmitter as unknown as Socket;

		trackSocket(openSockets, mockSocket);

		expect(openSockets.has(mockSocket)).toBe(true);
		expect(openSockets.size).toBe(1);

		socketEmitter.emit("close");

		expect(openSockets.has(mockSocket)).toBe(false);
		expect(openSockets.size).toBe(0);
	});
});
