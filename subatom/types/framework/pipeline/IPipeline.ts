export type TCorsOriginFunction = (
	origin: string | undefined,
	callback: (err: Error | null, allow?: boolean) => void,
) => void;

export interface ICorsOptions {
	origin?: string | string[] | boolean | TCorsOriginFunction;
	methods?: string | string[];
	allowedHeaders?: string | string[];
	exposedHeaders?: string | string[];
	credentials?: boolean;
	maxAge?: number;
	optionsSuccessStatus?: number;
}

export interface ILimit {
	limit?: string | number;
}

export interface IRawOptions {
	limit?: string | number;
	type?: string | string[];
}
export interface IStaticOptions {
	index?: string;
	dotfiles?: "allow" | "ignore" | "deny";
	autoCreateDir?: boolean; // 👈 Added option (default: true)
}

export interface ITextOptions {
	limit?: string | number;
	type?: string | string[];
	defaultEncoding?: BufferEncoding;
}
