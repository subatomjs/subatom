/**
 * @fileoverview This module is responsible for HTTP session management,
 *  providing cookie-based session handling, persistent store synchronization, and session lifecycle controls.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { randomBytes } from "node:crypto";
import type { ServerResponse } from "node:http";
import type {
	ISession,
	ISessionData,
	ISessionOptions,
} from "./types/session.types.js";
import type { NextFunction } from "../next/types/nextFunction.types.js";
import type { IRequest } from "../../core/http/request/types/request.types.js";
import type { IResponse } from "../../core/http/response/types/response.types.js";
import {
	parseCookieHeader,
	serializeCookie,
	MemoryStore,
	sign,
	unsign,
} from "./utils/index.utils.js";
import { RedisSessionStore } from "./utils/redis/RedisSessionStore.js";

const defaultOptions: Partial<ISessionOptions> = {
	name: "sid",
	resave: false,
	saveUninitialized: false,
	rolling: false,
	cookie: {
		httpOnly: true,
		secure: false,
		maxAge: 60 * 60 * 1000,
	},
};

function defaultGenId(): string {
	return randomBytes(24).toString("hex");
}

export function session(options: ISessionOptions) {
	if (!options?.secret) {
		throw new Error("session middleware requires a `secret`");
	}

	let store = options.store;
	let ownsStore = !options.store;

	if (!store && process.env.NODE_ENV === "production") {
		if (options.allowInMemoryInProduction !== true) {
			const redisUrl = process.env.REDIS_URL;
			if (redisUrl) {
				try {
					const redisClient = createRedisClientFromUrl(redisUrl);
					store = new RedisSessionStore(redisClient);
					ownsStore = true;
				} catch (error) {
					throw new Error(
						`Redis session store initialization failed: ${
							error instanceof Error ? error.message : String(error)
						}. Set REDIS_URL or configure store explicitly.`,
					);
				}
			} else {
				throw new Error(
					"A distributed session store is required in production. Configure REDIS_URL environment variable or pass a custom store.",
				);
			}
		}
	}

	if (!store) {
		store = new MemoryStore();
	}

	const opts = { ...defaultOptions, ...options };
	const cookieOpts = { ...defaultOptions.cookie, ...options.cookie };
	const genid = opts.genid ?? defaultGenId;
	const cookieName = opts.name ?? "sid";

	const middleware = async (
		req: IRequest,
		res: IResponse,
		next: NextFunction,
	) => {
		// 1. Read + verify the session id from the cookie
		const rawCookies = parseCookieHeader(
			req.raw.headers.cookie as string | undefined,
		);
		const signedSid = rawCookies[cookieName];
		const unsignedSid = signedSid ? unsign(signedSid, opts.secret) : false;

		let sid = unsignedSid || genid();
		let isNew = !unsignedSid;
		let data: ISessionData = {};

		if (unsignedSid) {
			const loaded = await store.get(unsignedSid);
			if (loaded) {
				data = loaded;
			} else {
				// signature valid but store has no matching entry (expired/evicted)
				isNew = true;
				sid = genid();
			}
		}

		const originalSnapshot = JSON.stringify(data);

		// 2. Build req.session
		const buildSession = (
			id: string,
			initialData: ISessionData,
			initiallyNew: boolean,
		): ISession => {
			const sessionObj = {
				...initialData,
				id,
				isNew: initiallyNew,

				async save(): Promise<void> {
					const {
						id: _id,
						isNew: _isNew,
						save: _save,
						destroy: _destroy,
						regenerate: _regenerate,
						...plain
					} = sessionObj as ISession & Record<string, unknown>;
					await store.set(
						sessionObj.id,
						plain as ISessionData,
						cookieOpts.maxAge,
					);
				},

				async destroy(): Promise<void> {
					await store.destroy(sessionObj.id);
					res.setHeader(
						"Set-Cookie",
						serializeCookie(cookieName, "", { ...cookieOpts, maxAge: 0 }),
					);
				},

				async regenerate(): Promise<void> {
					await store.destroy(sessionObj.id);
					const newId = genid();
					sessionObj.id = newId;
					sessionObj.isNew = true;
					req.sessionID = newId;
				},
			} as ISession;

			return sessionObj;
		};

		req.session = buildSession(sid, data, isNew);
		req.sessionID = sid;

		const finalize = async () => {
			const {
				id: _id,
				isNew: _isNew,
				save: _save,
				destroy: _destroy,
				regenerate: _regenerate,
				...plain
			} = req.session as ISession & Record<string, unknown>;

			const changed = JSON.stringify(plain) !== originalSnapshot;
			const shouldSave =
				changed || opts.resave || (req.session.isNew && opts.saveUninitialized);

			if (shouldSave) {
				await store.set(
					req.session.id,
					plain as ISessionData,
					cookieOpts.maxAge,
				);

				const shouldSetCookie = req.session.isNew || opts.rolling || changed;
				if (shouldSetCookie) {
					res.setHeader(
						"Set-Cookie",
						serializeCookie(
							cookieName,
							sign(req.session.id, opts.secret),
							cookieOpts,
						),
					);
				}
			}
		};

		const rawRes = res.raw as ServerResponse;
		let finalized = false;

		if (rawRes && typeof rawRes.end === "function") {
			const originalEndMethod = rawRes.end;
			const originalEnd = rawRes.end.bind(rawRes);
			const invokeOriginalEnd = (args: never[]) =>
				Reflect.apply(originalEnd, rawRes, args) as ServerResponse;

			rawRes.end = (...args: never[]) => {
				if (finalized) return invokeOriginalEnd(args);
				finalized = true;

				finalize()
					.catch((err: unknown) => {
						// eslint-disable-next-line no-console
						console.error("[session] failed to persist session:", err);
					})
					.finally(() => {
						invokeOriginalEnd(args);
					});

				return rawRes;
			};

			try {
				await next();

				// Handler forgot to send a response at all — still try to persist.
				if (!finalized) {
					finalized = true;
					await finalize();
				}
			} finally {
				rawRes.end = originalEndMethod;
			}
		} else {
			await next();
			await finalize();
		}
	};

	return Object.assign(middleware, {
		close: async () => {
			if (ownsStore) await store.close?.();
		},
	});
}

function createRedisClientFromUrl(url: string): {
	eval: (
		script: string,
		_keys: number,
		...args: (string | number)[]
	) => Promise<unknown>;
} {
	try {
		// eslint-disable-next-line global-require
		const redisModule = require("redis") as {
			createClient: (options: { url: string }) => {
				connect: () => Promise<void>;
				eval: (
					script: string,
					options: { keys: string[]; arguments: (string | number)[] },
				) => Promise<unknown>;
			};
		};
		const client = redisModule.createClient({ url });
		void client.connect();
		return {
			eval: (script: string, _keys: number, ...args: (string | number)[]) =>
				client.eval(script, {
					keys: [String(args[0])],
					arguments: args.slice(1),
				}),
		};
	} catch {
		throw new Error(
			"Failed to import Redis client. Install with: npm install redis",
		);
	}
}
