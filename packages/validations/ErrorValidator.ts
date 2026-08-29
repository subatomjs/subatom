/**
 * @fileoverview Defines a validation-specific error that extends SubatomError and stores a 422 status,
 * validation code, details, and operational error state.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { SubatomError } from "../errors/Errors.js";
import type { ValidationIssue } from "./types/validator.types.js";

export class ErrorValidator extends SubatomError {
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
