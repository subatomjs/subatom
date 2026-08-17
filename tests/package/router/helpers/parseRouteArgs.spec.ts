import { describe, expect, it } from "vitest";
import { parseRouteArgs } from "../../../../package/core/router/helpers/parseRouteArgs.js";
import type {
	IHandler,
	IRouteOptions,
} from "../../../../package/types/framework/router/IRouter.js";

describe("Unit: parseRouteArgs", () => {
	const handlerA: IHandler = () => {};
	const handlerB: IHandler = () => {};

	it("should return empty handlers and empty options when called with no arguments", () => {
		const result = parseRouteArgs([]);
		expect(result).toEqual({ handlers: [], options: {} });
	});

	it("should return handlers and empty options when no options object is provided", () => {
		const result = parseRouteArgs([handlerA, handlerB]);
		expect(result).toEqual({ handlers: [handlerA, handlerB], options: {} });
	});

	it("should extract options object when passed as the last argument", () => {
		const opts: IRouteOptions = { name: "users.get", tags: ["auth"] };
		const result = parseRouteArgs([handlerA, opts]);
		expect(result).toEqual({ handlers: [handlerA], options: opts });
	});

	it("should not treat functions or arrays as options even if at the end", () => {
		const result = parseRouteArgs([handlerA, handlerB]);
		expect(result.handlers).toEqual([handlerA, handlerB]);
		expect(result.options).toEqual({});
	});
});
