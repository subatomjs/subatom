export interface ISessionData {
	[key: string]: unknown;
}

export interface ISessionStore {
	get(sid: string): Promise<ISessionData | null>;
	set(sid: string, data: ISessionData, maxAgeMs?: number): Promise<void>;
	destroy(sid: string): Promise<void>;
	touch?(sid: string, maxAgeMs?: number): Promise<void>;
	close?(): Promise<void>;
}

export interface ISessionCookieOptions {
	httpOnly?: boolean;
	secure?: boolean;
	maxAge?: number; // ms
	path?: string;
	domain?: string;
	sameSite?: boolean | "lax" | "strict" | "none";
}

export interface ISessionOptions {
	secret: string;
	name?: string; // cookie name, default "sid"
	store?: ISessionStore;
	allowInMemoryInProduction?: boolean;
	resave?: boolean;
	saveUninitialized?: boolean;
	rolling?: boolean;
	genid?: () => string;
	cookie?: ISessionCookieOptions;
}

export interface ISession extends ISessionData {
	id: string;
	isNew: boolean;
	destroy(): Promise<void>;
	regenerate(): Promise<void>;
	save(): Promise<void>;
}

// Augment IRequest so req.session / req.sessionID are typed everywhere
declare module "../../../core/http/request/types/request.types.js" {
	interface IRequest {
		session: ISession;
		sessionID: string;
	}
}
