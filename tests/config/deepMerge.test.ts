import { describe, expect, it } from "vitest";
import { deepMerge } from "../../config/deepMerge.js";
import { mergeConfig } from "../../config/helpers/marge.config.js";

type DeepPartial<T> = {
	[P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

type MergeFn = <T extends object>(
	...objects: (DeepPartial<T> | Record<string, unknown> | undefined | null)[]
) => T;

describe.each<{ name: string; fn: MergeFn }>([
	{ name: "deepMerge", fn: deepMerge as MergeFn },
	{ name: "mergeConfig", fn: mergeConfig as unknown as MergeFn },
])("$name", ({ fn }) => {
	it("should return empty object when no arguments or only null/undefined provided", () => {
		expect(fn()).toEqual({});
		expect(fn(undefined, null, undefined)).toEqual({});
	});

	it("should merge flat primitives and override left-to-right", () => {
		const target = { a: 1, b: "hello", c: true };
		const source = { b: "world", c: false };

		const result = fn(target, source);
		expect(result).toEqual({ a: 1, b: "world", c: false });
	});

	it("should skip undefined values and preserve underlying target values", () => {
		const target = { a: 1, b: 2 };
		const source = { b: undefined, a: 10 };

		const result = fn(target, source);
		expect(result).toEqual({ a: 10, b: 2 });
	});

	it("should recursively merge nested plain objects", () => {
		interface ServerConfig {
			server: {
				host?: string;
				port?: number;
				meta?: {
					active?: boolean;
					env?: string;
				};
			};
		}

		const target: ServerConfig = {
			server: { host: "localhost", port: 3000, meta: { active: true } },
		};
		const source: ServerConfig = {
			server: { port: 8080, meta: { env: "prod" } },
		};

		const result = fn<ServerConfig>(target, source);
		expect(result).toEqual({
			server: {
				host: "localhost",
				port: 8080,
				meta: { active: true, env: "prod" },
			},
		});
	});

	it("should handle nested merge when target key previously held a primitive or null", () => {
		const target: Record<string, unknown> = { nested: null };
		const source: Record<string, unknown> = { nested: { a: 1 } };

		const result = fn(target, source);
		expect(result).toEqual({ nested: { a: 1 } });
	});

	it("should replace arrays entirely rather than merging or concatenating", () => {
		const target = { list: [1, 2, 3] };
		const source = { list: [4, 5] };

		const result = fn(target, source);
		expect(result).toEqual({ list: [4, 5] });
		expect(result.list).not.toBe(source.list);
	});

	it("should treat Date and RegExp instances as primitives rather than traversing them", () => {
		const date1 = new Date("2026-01-01");
		const date2 = new Date("2026-06-01");
		const regex1 = /abc/g;
		const regex2 = /xyz/i;

		const target = { date: date1, regex: regex1 };
		const source = { date: date2, regex: regex2 };

		const result = fn(target, source);
		expect(result.date).toBe(date2);
		expect(result.regex).toBe(regex2);
	});

	it("should not mutate original input objects", () => {
		interface NestedObj {
			a: {
				b?: number;
				c?: number;
			};
		}

		const target: NestedObj = { a: { b: 1 } };
		const source: NestedObj = { a: { c: 2 } };

		const result = fn<NestedObj>(target, source);
		expect(result).toEqual({ a: { b: 1, c: 2 } });
		expect(target).toEqual({ a: { b: 1 } });
	});
});