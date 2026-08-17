import { describe, it, expect } from "vitest";
import * as StreamModule from "../../../package/core/http/streams/index.js";

describe("http/streams index barrel export verification", () => {
    it("should export all pipeline, file streaming, and utility APIs", () => {
        expect(typeof StreamModule.pipeToResponse).toBe("function");
        expect(typeof StreamModule.composePipeline).toBe("function");
        expect(typeof StreamModule.streamFileToResponse).toBe("function");
        expect(typeof StreamModule.parseRange).toBe("function");
        expect(typeof StreamModule.streamResponse).toBe("function");
        expect(typeof StreamModule.bindAbortSignal).toBe("function");
        expect(typeof StreamModule.onClientDisconnect).toBe("function");
        expect(typeof StreamModule.writeWithBackpressure).toBe("function");
    });
});