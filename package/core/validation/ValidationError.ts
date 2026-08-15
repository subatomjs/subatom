import { SubatomError } from "../http/errors/Error.js";

export interface ValidationIssue {
	path: string;
	rule: string;
	message: string;
	received?: unknown;
	expected?: unknown;
}

export class ValidationError extends SubatomError {
	constructor(issues: ValidationIssue[]) {
		super("Request validation failed", {
			statusCode: 422,
			errorCode: "VALIDATION_ERROR",
			details: issues,
			isOperational: true,
		});
		this.name = "ValidationError";
	}
}
