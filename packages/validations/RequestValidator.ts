/**
 * @fileoverview Validates request body, query, params, headers, and files, with type coercion,
 * schema support, file normalization, and structured validation errors.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { FileUpload } from "../pipelines/files/FileUpload.js";
import type { MiddlewareHandler } from "../pipelines/pipeline.types.js";
import type { IRouteSchema } from "../core/router/types/router.types.js";
import { ErrorValidator } from "./ErrorValidator.js";
import type {
	SafeParseResult,
	SchemaValidatorObject,
	ValidationIssue,
} from "./types/validator.types.js";

interface UploadFileLike {
	_isUploadFile?: boolean;
	filename?: string;
	stream?: () => unknown;
}

function isUploadFileLike(val: unknown): val is FileUpload | UploadFileLike {
	if (!val || typeof val !== "object") return false;
	const candidate = val as UploadFileLike;
	return (
		val instanceof FileUpload ||
		candidate._isUploadFile === true ||
		(typeof candidate.filename === "string" &&
			typeof candidate.stream === "function")
	);
}

function inspectRuleExpectedType(rule: unknown): string | undefined {
	if (!rule || (typeof rule !== "object" && typeof rule !== "function")) {
		return undefined;
	}

	const r = rule as SchemaValidatorObject;
	const inner =
		r._def?.innerType ??
		r._def?.schema ??
		r.innerType ??
		r.schema ??
		r._def?.type;

	if (inner && inner !== rule) {
		const unwrapped = inspectRuleExpectedType(inner);
		if (unwrapped) return unwrapped;
	}

	const indicator = String(
		r.type ??
			r._type ??
			r.typeName ??
			r._def?.typeName ??
			r._def?.type ??
			r.name ??
			r.constructor?.name ??
			"",
	).toLowerCase();

	if (
		indicator.includes("number") ||
		indicator.includes("integer") ||
		indicator.includes("int") ||
		indicator.includes("float") ||
		indicator.includes("double")
	) {
		return "number";
	}

	if (indicator.includes("bool")) {
		return "boolean";
	}

	if (indicator.includes("file") || indicator.includes("upload")) {
		return "file";
	}

	if (indicator.includes("array")) {
		return "array";
	}

	if (indicator.includes("object")) {
		return "object";
	}

	return undefined;
}

export function coerceValue(value: unknown, expectedType?: string): unknown {
	if (typeof value !== "string") return value;

	const trimmed = value.trim();

	if (expectedType === "number" || expectedType === "integer") {
		const num = Number(trimmed);
		return !Number.isNaN(num) && trimmed !== "" ? num : value;
	}

	if (expectedType === "boolean") {
		if (trimmed.toLowerCase() === "true" || trimmed === "1") return true;
		if (trimmed.toLowerCase() === "false" || trimmed === "0") return false;
	}

	if (trimmed.toLowerCase() === "true") return true;
	if (trimmed.toLowerCase() === "false") return false;
	if (!Number.isNaN(Number(trimmed)) && trimmed !== "") return Number(trimmed);

	return value;
}

function autoCoerceObject(
	data: Record<string, unknown>,
	rulesMap?: Record<string, unknown>,
): Record<string, unknown> {
	const result: Record<string, unknown> = { ...data };

	for (const [key, value] of Object.entries(result)) {
		if (typeof value === "string") {
			const rule = rulesMap ? rulesMap[key] : undefined;
			const expectedType = inspectRuleExpectedType(rule);
			result[key] = coerceValue(value, expectedType);
		}
	}

	return result;
}

function formatIssuePath(parentKey: string, subPath?: unknown): string {
	let cleanSub = "";
	if (Array.isArray(subPath)) {
		cleanSub = subPath
			.filter((p) => p !== undefined && p !== null && p !== "")
			.join(".");
	} else if (typeof subPath === "string") {
		cleanSub = subPath;
	} else if (typeof subPath === "number") {
		cleanSub = String(subPath);
	}

	cleanSub = cleanSub.replace(/^\.+|\.+$/g, "");
	const cleanParent = parentKey.replace(/^\.+|\.+$/g, "");

	if (cleanParent && cleanSub) {
		return `${cleanParent}.${cleanSub}`;
	}
	return cleanParent || cleanSub || "";
}

function normalizeFiles<T>(files: T): T {
	if (Array.isArray(files)) {
		return files as T;
	}
	if (files && typeof files === "object") {
		const normalized: Record<string, unknown> = {};
		for (const [key, val] of Object.entries(files as Record<string, unknown>)) {
			if (Array.isArray(val) && val.length === 1 && isUploadFileLike(val[0])) {
				normalized[key] = val[0];
			} else {
				normalized[key] = val;
			}
		}
		return normalized as T;
	}
	return files;
}

function resolveValidator(schemaPart: unknown, shouldAutoCoerce = false) {
	if (!schemaPart) return null;

	const candidate = schemaPart as SchemaValidatorObject &
		Record<string, unknown>;
	const shapeVal = candidate._def?.shape;
	const resolvedShape = typeof shapeVal === "function" ? shapeVal() : shapeVal;

	const rulesMap: Record<string, unknown> | undefined =
		typeof schemaPart === "object" && schemaPart !== null
			? (candidate.shape ??
				resolvedShape ??
				(typeof candidate.safeParse !== "function" ? candidate : undefined))
			: undefined;

	return {
		safeParse: async (targetVal: unknown) => {
			if (
				!targetVal ||
				typeof targetVal !== "object" ||
				Array.isArray(targetVal)
			) {
				return {
					success: false,
					issues: [
						{
							path: "",
							rule: "type",
							message: "Expected object",
							received: typeof targetVal,
						} as ValidationIssue,
					],
				};
			}

			const data = shouldAutoCoerce
				? autoCoerceObject(targetVal as Record<string, unknown>, rulesMap)
				: { ...(targetVal as Record<string, unknown>) };

			// Case 1: Schema has its own validator instance (.safeParse)
			if (typeof candidate.safeParse === "function") {
				const res = (await candidate.safeParse(data)) as SafeParseResult;
				if (!res.success) {
					const rawIssues =
						res.issues || res.error?.issues || res.error?.details || [];
					const issues: ValidationIssue[] = rawIssues.map((sub) => ({
						path: formatIssuePath("", sub.path),
						rule: sub.rule || "invalid_type",
						message: sub.message || "Validation failed",
						received: sub.received,
						expected: sub.expected,
					}));
					return { success: false, issues };
				}
				return {
					success: true,
					data: res.data !== undefined ? res.data : data,
				};
			}

			// Case 2: Schema is a raw key-value dictionary of rules
			const rules = schemaPart as Record<string, unknown>;
			const issues: ValidationIssue[] = [];

			for (const [key, rule] of Object.entries(rules)) {
				let fieldValue = data[key];
				const expectedType = inspectRuleExpectedType(rule);

				if (
					Array.isArray(fieldValue) &&
					fieldValue.length === 1 &&
					expectedType !== "array" &&
					isUploadFileLike(fieldValue[0])
				) {
					fieldValue = fieldValue[0];
				}

				if (typeof fieldValue === "string") {
					fieldValue = coerceValue(fieldValue, expectedType);
				}

				data[key] = fieldValue;

				const typedRule = rule as SchemaValidatorObject | undefined;
				if (typedRule && typeof typedRule.safeParse === "function") {
					const res = (await typedRule.safeParse(
						fieldValue,
					)) as SafeParseResult;
					if (!res.success) {
						const subIssues = res.issues ||
							res.error?.issues ||
							res.error?.details || [
								{
									path: "",
									rule: "invalid_type",
									message:
										res.error?.message ||
										`Validation failed for field '${key}'`,
									received: Array.isArray(fieldValue)
										? "array"
										: typeof fieldValue,
									expected: expectedType,
								},
							];

						for (const sub of subIssues) {
							issues.push({
								path: formatIssuePath(key, sub.path),
								rule: sub.rule || "invalid_type",
								message: sub.message || `Invalid value for '${key}'`,
								received:
									sub.received !== undefined
										? sub.received
										: Array.isArray(fieldValue)
											? "array"
											: typeof fieldValue,
								expected: sub.expected ?? expectedType,
							});
						}
					} else {
						data[key] = res.data !== undefined ? res.data : fieldValue;
					}
				}
			}

			if (issues.length > 0) {
				return { success: false, issues };
			}

			return { success: true, data };
		},
	};
}

export function buildRequestValidator(schema: IRouteSchema): MiddlewareHandler {
	const queryValidator = resolveValidator(schema.query, true);
	const paramsValidator = resolveValidator(schema.params, true);
	const headersValidator = resolveValidator(schema.headers, true);
	const bodyValidator = resolveValidator(schema.body, true);
	const fileValidator = resolveValidator(schema.file, false);
	const filesValidator = resolveValidator(schema.files, false);

	return async (req, _res, next) => {
		const issues: ValidationIssue[] = [];

		if (req.files && typeof req.files === "object") {
			req.files = normalizeFiles(req.files);
			if (
				req.body &&
				typeof req.body === "object" &&
				!Array.isArray(req.body)
			) {
				const bodyObj = req.body as Record<string, unknown>;
				for (const [key, val] of Object.entries(
					req.files as Record<string, unknown>,
				)) {
					if (bodyObj[key] === undefined) {
						bodyObj[key] = val;
					} else if (
						Array.isArray(bodyObj[key]) &&
						(bodyObj[key] as unknown[]).length === 1 &&
						isUploadFileLike((bodyObj[key] as unknown[])[0])
					) {
						bodyObj[key] = (bodyObj[key] as unknown[])[0];
					}
				}
			}
		}

		if (req.file && isUploadFileLike(req.file)) {
			if (
				req.body &&
				typeof req.body === "object" &&
				!Array.isArray(req.body)
			) {
				const reqExtended = req as typeof req & { fileField?: string };
				const fileKey = reqExtended.fileField || "file";
				const bodyObj = req.body as Record<string, unknown>;
				if (bodyObj[fileKey] === undefined) {
					bodyObj[fileKey] = req.file;
				}
			}
		}

		async function processValidator<T>(
			validator: ReturnType<typeof resolveValidator>,
			targetData: T,
			defaultPath: string,
		): Promise<T> {
			if (!validator) return targetData;
			const result = await validator.safeParse(targetData);
			if (!result.success) {
				if (result.issues && Array.isArray(result.issues)) {
					issues.push(...result.issues);
				} else {
					issues.push({
						path: defaultPath,
						rule: "validation",
						message: `Invalid ${defaultPath}`,
					});
				}
				return targetData;
			}
			return (result.data !== undefined ? result.data : targetData) as T;
		}

		req.body = await processValidator(bodyValidator, req.body, "body");
		req.query = await processValidator(queryValidator, req.query, "query");
		req.params = await processValidator(paramsValidator, req.params, "params");

		if (headersValidator) {
			await processValidator(headersValidator, req.headers, "headers");
		}

		req.file = await processValidator(fileValidator, req.file, "file");
		req.files = await processValidator(filesValidator, req.files, "files");

		if (issues.length > 0) {
			return next(new ErrorValidator(issues));
		}

		return next();
	};
}
