import { describe, expect, it } from "vitest";
import {
	isRouteMetaOptions,
	isRouteOptions,
	parseRouteArgs,
} from "../../../../../packages/core/router/helpers/parseRouteArgs.js";

describe("parseRouteArgs", () => {
	const handler = () => undefined;
	const middleware = () => undefined;

	it("should parse a single handler", () => {
		expect(parseRouteArgs([handler])).toEqual({
			handlers: [handler],
			options: {},
		});
	});

	it("should parse handlers followed by route metadata options", () => {
		const options = { name: "users.index", tags: ["users"] };

		expect(parseRouteArgs([handler, options])).toEqual({
			handlers: [handler],
			options,
		});
	});

	it("should parse multiple middleware and controller handlers", () => {
		expect(parseRouteArgs([middleware, handler])).toEqual({
			handlers: [middleware, handler],
			options: {},
		});
	});

	it("should distinguish route options with an inline controller", () => {
		const options = {
			controller: handler,
			middleware: [middleware],
		};

		expect(isRouteOptions(options)).toBe(true);
		expect(parseRouteArgs([options])).toEqual({
			handlers: [options],
			options: {},
		});
	});

	it("should identify metadata options and empty arguments", () => {
		expect(isRouteMetaOptions({ schema: { body: {} } })).toBe(true);
		expect(isRouteMetaOptions({ controller: handler })).toBe(false);
		expect(parseRouteArgs([])).toEqual({ handlers: [], options: {} });
	});
});
