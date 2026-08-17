import { describe, expect, it, vi } from "vitest";
import { session } from "../../../package/core/factory-functions/session.js";
import { MemoryStore } from "../../../package/core/factory-functions/utils/MemoryStore.js";
import { sign } from "../../../package/core/factory-functions/utils/signature.js";
import type { IRequest } from "../../../package/types/http/IRequest.js";
import type { IResponse } from "../../../package/types/http/IResponse.js";

function createMockHttp(options: {
    cookieHeader?: string;
    hasRawResEnd?: boolean;
}) {
    const rawReq = {
        headers: {
            cookie: options.cookieHeader,
        },
    };

    let setCookieHeader: string | undefined;
    const endSpy = vi.fn();
    const rawRes: any = {
        end: options.hasRawResEnd !== false ? endSpy : undefined,
    };

    const req = {
        raw: rawReq,
        session: undefined,
        sessionID: undefined,
    } as unknown as IRequest;

    const res = {
        raw: rawRes,
        setHeader: vi.fn((key: string, value: string) => {
            if (key.toLowerCase() === "set-cookie") {
                setCookieHeader = value;
            }
        }),
    } as unknown as IResponse;

    return {
        req,
        res,
        rawRes,
        endSpy,
        getSetCookie: () => setCookieHeader,
    };
}

describe("Session Middleware Factory", () => {
    const secret = "subatom-production-secret-999";

    it("should throw an error if secret is missing", () => {
        expect(() => (session as any)({})).toThrow("session middleware requires a `secret`");
    });

    it("should create a new session if no cookie exists and save session when mutated", async () => {
        const store = new MemoryStore();
        const middleware = session({ secret, store });
        const { req, res, getSetCookie } = createMockHttp({ hasRawResEnd: false });

        let sessionCaptured: any;
        const next = vi.fn(async () => {
            sessionCaptured = req.session;
            req.session.userId = 42;
        });

        await middleware(req, res, next);

        expect(sessionCaptured).toBeDefined();
        expect(sessionCaptured.isNew).toBe(true);
        expect(req.sessionID).toBeDefined();
        const stored = await store.get(req.sessionID);
        expect(stored).toEqual({ userId: 42 });
        expect(getSetCookie()).toContain(`sid=`);
        expect(getSetCookie()).toContain("; HttpOnly");
    });

    it("should restore an existing session from signed cookie", async () => {
        const store = new MemoryStore();
        const existingSid = "valid-sid-123";
        await store.set(existingSid, { user: "Kunal", role: "maintainer" });

        const signedCookie = sign(existingSid, secret);
        const middleware = session({ secret, store });
        const { req, res } = createMockHttp({
            cookieHeader: `sid=${signedCookie}`,
            hasRawResEnd: false,
        });

        let sessionCaptured: any;
        const next = vi.fn(async () => {
            sessionCaptured = req.session;
        });

        await middleware(req, res, next);

        expect(sessionCaptured).toBeDefined();
        expect(sessionCaptured.isNew).toBe(false);
        expect(req.sessionID).toBe(existingSid);
        expect(sessionCaptured.user).toBe("Kunal");
        expect(sessionCaptured.role).toBe("maintainer");
    });

    it("should regenerate session ID on session.regenerate()", async () => {
        const store = new MemoryStore();
        const initialSid = "initial-sid";
        await store.set(initialSid, { data: "old" });

        const middleware = session({ secret, store });
        const { req, res } = createMockHttp({
            cookieHeader: `sid=${sign(initialSid, secret)}`,
            hasRawResEnd: false,
        });

        let oldId = "";
        let newId = "";

        const next = vi.fn(async () => {
            oldId = req.session.id;
            await req.session.regenerate();
            newId = req.session.id;
        });

        await middleware(req, res, next);

        expect(newId).not.toBe("");
        expect(newId).not.toBe(oldId);
        expect(req.session.isNew).toBe(true);
        expect(req.sessionID).toBe(newId);
        expect(await store.get(initialSid)).toBeNull();
    });

    it("should destroy session and clear Set-Cookie on session.destroy()", async () => {
        const store = new MemoryStore();
        const sid = "session-to-destroy";
        await store.set(sid, { active: true });

        const middleware = session({ secret, store });
        const { req, res, getSetCookie } = createMockHttp({
            cookieHeader: `sid=${sign(sid, secret)}`,
            hasRawResEnd: false,
        });

        const next = vi.fn(async () => {
            await req.session.destroy();
        });

        await middleware(req, res, next);

        expect(await store.get(sid)).toBeNull();
        expect(getSetCookie()).toContain("Max-Age=0");
    });

    it("should explicitly persist data via session.save()", async () => {
        const store = new MemoryStore();
        const middleware = session({ secret, store });
        const { req, res } = createMockHttp({ hasRawResEnd: false });

        const next = vi.fn(async () => {
            req.session.manualSave = true;
            await req.session.save();
        });

        await middleware(req, res, next);

        const loaded = await store.get(req.sessionID);
        expect(loaded).toEqual({ manualSave: true });
    });

    it("should hook into rawRes.end to finalize session persistence", async () => {
        const store = new MemoryStore();
        const middleware = session({ secret, store, rolling: true });
        const { req, res, rawRes, endSpy, getSetCookie } = createMockHttp({ hasRawResEnd: true });

        const next = vi.fn(async () => {
            req.session.endData = "persistedViaEnd";
            rawRes.end("done");
        });

        await middleware(req, res, next);

        expect(endSpy).toHaveBeenCalled();
        const saved = await store.get(req.sessionID);
        expect(saved).toEqual({ endData: "persistedViaEnd" });
        expect(getSetCookie()).toBeDefined();
    });
});
