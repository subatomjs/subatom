import type { IRouteSchema } from "../../types/framework/router/IRouter.js";
import type { MiddlewareHandler } from "../../types/http/IMiddleware.js";
import { SchemaValidator } from "./SchemaValidator.js";
import { ValidationError, type ValidationIssue } from "./ValidationError.js";

export function buildRequestValidator(schema: IRouteSchema): MiddlewareHandler {
	const bodyValidator = schema.body
		? SchemaValidator.compile(schema.body)
		: null;
	const queryValidator = schema.query
		? SchemaValidator.compile(schema.query)
		: null;
	const paramsValidator = schema.params
		? SchemaValidator.compile(schema.params)
		: null;
	const headersValidator = schema.headers
		? SchemaValidator.compile(schema.headers)
		: null;

	// Now strictly typed via IRouteSchema
	const fileValidator = schema.file
		? SchemaValidator.compile(schema.file)
		: null;
	const filesValidator = schema.files
		? SchemaValidator.compile(schema.files)
		: null;

	return async (req, res, next) => {
		const issues: ValidationIssue[] = [];

		if (bodyValidator) issues.push(...(await bodyValidator(req.body, "body")));
		if (queryValidator)
			issues.push(...(await queryValidator(req.query, "query")));
		if (paramsValidator)
			issues.push(...(await paramsValidator(req.params, "params")));
		if (headersValidator)
			issues.push(...(await headersValidator(req.headers, "headers")));
		if (fileValidator) issues.push(...(await fileValidator(req.file, "file")));
		if (filesValidator)
			issues.push(...(await filesValidator(req.files, "files")));

		if (issues.length > 0) {
			return next(new ValidationError(issues));
		}

		return next();
	};
}
