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

	const opts = { ...defaultOptions, ...options };
	const cookieOpts = { ...defaultOptions.cookie, ...options.cookie };
	const store = opts.store ?? new MemoryStore();
	const genid = opts.genid ?? defaultGenId;
	const cookieName = opts.name ?? "sid";

	return async (req: IRequest, res: IResponse, next: NextFunction) => {
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

		// 3. Run downstream handlers
		await next();

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
			const originalEnd = rawRes.end.bind(rawRes);

			rawRes.end = (...args: never[]) => {
				if (finalized) return originalEnd(...args);
				finalized = true;

				finalize()
					.catch((err: unknown) => {
						// eslint-disable-next-line no-console
						console.error("[session] failed to persist session:", err);
					})
					.finally(() => {
						originalEnd(...args);
					});

				return rawRes;
			};

			await next();

			// Handler forgot to send a response at all — still try to persist.
			if (!finalized) {
				finalized = true;
				await finalize();
			}
		} else {
			await next();
			await finalize();
		}
	};
}
