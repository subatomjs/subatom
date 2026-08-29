/**
 * @fileoverview Type interface for global error object.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

export interface ISubatomError {
	statusCode?: number;
	errorCode?: string;
	details?: unknown;
	isOperational?: boolean;
}
