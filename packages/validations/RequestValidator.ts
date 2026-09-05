/**
 * @fileoverview Validates request body, query, params, headers, and files, with type coercion,
 * schema support, file normalization, and structured validation errors.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import {
	isMultipleFilesRule,
	isSingleFileRule,
} from "../../openapi/openApiGenerator.js";
import type { IRouteSchema } from "../core/router/types/router.types.js";
import { FileUpload } from "../pipelines/files/FileUpload.js";
import type { MiddlewareHandler } from "../pipelines/pipeline.types.js";
import { ErrorValidator } from "./ErrorValidator.js";
import type {
	SafeParseResult,
	SchemaValidatorObject,
	StandardSchemaIssue,
	StandardSchemaValidator,
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

	if (isMultipleFilesRule(rule)) {
		return "files";
	}

	if (isSingleFileRule(rule)) {
		return "file";
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

	const def = r._def as Record<string, unknown> | undefined;

	const indicator = String(
		r.type ?? r._type ?? r.typeName ?? def?.typeName ?? def?.type ?? "",
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

	if (indicator.includes("array")) {
		return "array";
	}

	if (indicator.includes("object")) {
		return "object";
	}

	return undefined;
}

function isRuleOptional(rule: unknown): boolean {
	if (!rule || (typeof rule !== "object" && typeof rule !== "function")) {
		return false;
	}
	const r = rule as Record<string, unknown> & {
		_def?: Record<string, unknown>;
	};
	return (
		r.isOptional === true ||
		r._optional === true ||
		r.optional === true ||
		r._def?.isOptional === true ||
		r._def?.optional === true ||
		r._def?.typeName === "ZodOptional" ||
		r._def?.typeName === "ZodNullable" ||
		r._def?.typeName === "ZodDefault" ||
		r._def?.type === "optional"
	);
}

function sanitizeOptionalValue(value: unknown, isOptional: boolean): unknown {
	if (!isOptional || value === undefined || value === null) {
		return value;
	}

	if (typeof value === "string") {
		const trimmed = value.trim();
		if (
			trimmed === "" ||
			trimmed === "{id}" ||
			trimmed === "%7Bid%7D" ||
			trimmed.startsWith(":") ||
			(trimmed.startsWith("{") && trimmed.endsWith("}")) ||
			(trimmed.startsWith("%7B") && trimmed.endsWith("%7D"))
		) {
			return undefined;
		}
	}

	return value;
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

function autoCoerceTarget(
	targetVal: unknown,
	rulesMap?: Record<string, unknown>,
	expectedType?: string,
): unknown {
	if (Array.isArray(targetVal)) {
		return targetVal.map((item) => autoCoerceTarget(item, rulesMap));
	}

	if (targetVal && typeof targetVal === "object") {
		const result: Record<string, unknown> = {
			...(targetVal as Record<string, unknown>),
		};
		for (const [key, value] of Object.entries(result)) {
			if (typeof value === "string") {
				const rule = rulesMap ? rulesMap[key] : undefined;
				const innerExpected = inspectRuleExpectedType(rule);
				result[key] = coerceValue(value, innerExpected);
			}
		}
		return result;
	}

	if (typeof targetVal === "string") {
		return coerceValue(targetVal, expectedType);
	}

	return targetVal;
}

function formatIssuePath(parentKey: string, subPath?: unknown): string {
	let cleanSub = "";
	if (Array.isArray(subPath)) {
		cleanSub = subPath
			.filter((p) => p !== undefined && p !== null && p !== "")
			.map((p) =>
				typeof p === "object" && p !== null && "key" in p
					? String(p.key)
					: String(p),
			)
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

function isStandardSchema(val: unknown): val is StandardSchemaValidator {
	return (
		typeof val === "object" &&
		val !== null &&
		"~standard" in val &&
		typeof (val as StandardSchemaValidator)["~standard"] === "object" &&
		(val as StandardSchemaValidator)["~standard"] !== null &&
		typeof (val as StandardSchemaValidator)["~standard"].validate === "function"
	);
}

function resolveValidator(
	schemaPart: unknown,
	shouldAutoCoerce = false,
	isFilesValidation = false,
) {
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

	const rootExpectedType = inspectRuleExpectedType(schemaPart);

	return {
		safeParse: async (targetVal: unknown) => {
			const isRootOptional = isRuleOptional(candidate);
			const sanitizedRoot = sanitizeOptionalValue(targetVal, isRootOptional);

			if (sanitizedRoot === undefined || sanitizedRoot === null) {
				if (isRootOptional) {
					return { success: true, data: sanitizedRoot };
				}
			}

			let data = shouldAutoCoerce
				? autoCoerceTarget(sanitizedRoot, rulesMap, rootExpectedType)
				: sanitizedRoot;

			// 1. Direct validator instance (.safeParse)
			if (typeof candidate.safeParse === "function") {
				if (
					rootExpectedType === "file" &&
					Array.isArray(data) &&
					data.length === 1 &&
					isUploadFileLike(data[0])
				) {
					data = data[0];
				}

				const res = (await candidate.safeParse(data)) as SafeParseResult;
				if (!res.success) {
					const rawIssues =
						res.issues || res.error?.issues || res.error?.details || [];
					const issues: ValidationIssue[] =
						rawIssues.length > 0
							? rawIssues.map((sub) => ({
									path: formatIssuePath("", sub.path),
									rule: sub.rule || "invalid_type",
									message: sub.message || "Validation failed",
									received: sub.received,
									expected: sub.expected,
								}))
							: [
									{
										path: "",
										rule: "validation",
										message: res.error?.message || "Validation failed",
									},
								];
					return { success: false, issues };
				}
				return {
					success: true,
					data: res.data !== undefined ? res.data : data,
				};
			}

			// 2. Standard Schema (~standard)
			if (isStandardSchema(candidate)) {
				const standardRes = await candidate["~standard"].validate(data);
				if (standardRes.issues && standardRes.issues.length > 0) {
					const issues: ValidationIssue[] = standardRes.issues.map(
						(iss: StandardSchemaIssue) => ({
							path: formatIssuePath("", iss.path),
							rule: "invalid_type",
							message: iss.message || "Validation failed",
						}),
					);
					return { success: false, issues };
				}
				return { success: true, data: standardRes.value ?? data };
			}

			// 3. Root Array Schema
			if (Array.isArray(schemaPart)) {
				if (!Array.isArray(data)) {
					return {
						success: false,
						issues: [
							{
								path: "",
								rule: "type",
								message: "Expected array",
								received: typeof data,
								expected: "array",
							},
						],
					};
				}

				const elementValidator = resolveValidator(
					schemaPart[0],
					shouldAutoCoerce,
					isFilesValidation,
				);
				if (!elementValidator) {
					return { success: true, data };
				}

				const validatedArray: unknown[] = [];
				const issues: ValidationIssue[] = [];

				for (let i = 0; i < data.length; i++) {
					const elemRes = await elementValidator.safeParse(data[i]);
					if (!elemRes.success && elemRes.issues) {
						for (const issue of elemRes.issues) {
							issues.push({
								...issue,
								path: formatIssuePath(String(i), issue.path),
							});
						}
					} else {
						validatedArray.push(
							elemRes.data !== undefined ? elemRes.data : data[i],
						);
					}
				}

				if (issues.length > 0) return { success: false, issues };
				return { success: true, data: validatedArray };
			}

			// 4. Plain Dictionary of rules { [key]: rule }
			if (typeof schemaPart === "object" && schemaPart !== null) {
				const rules = schemaPart as Record<string, unknown>;
				const ruleKeys = Object.keys(rules);

				const originalWasArray = Array.isArray(data);
				let singleTargetKey: string | undefined;

				if (isFilesValidation && Array.isArray(data)) {
					singleTargetKey = ruleKeys.length === 1 ? ruleKeys[0] : undefined;
					if (singleTargetKey) {
						const mappedObj: Record<string, unknown> = {};
						mappedObj[singleTargetKey] = data;
						data = mappedObj;
					}
				}

				if (typeof data !== "object" || data === null || Array.isArray(data)) {
					return {
						success: false,
						issues: [
							{
								path: "",
								rule: "type",
								message: "Expected object",
								received: Array.isArray(data) ? "array" : typeof data,
								expected: "object",
							},
						],
					};
				}

				const objData = { ...(data as Record<string, unknown>) };
				const issues: ValidationIssue[] = [];

				for (const [key, rule] of Object.entries(rules)) {
					const optional = isRuleOptional(rule);
					let fieldValue = sanitizeOptionalValue(objData[key], optional);

					if (
						(fieldValue === undefined ||
							fieldValue === null ||
							fieldValue === "") &&
						optional
					) {
						delete objData[key];
						continue;
					}

					const expectedType = inspectRuleExpectedType(rule);

					// Unwrap single file from array container
					if (
						(expectedType === "file" || !isMultipleFilesRule(rule)) &&
						Array.isArray(fieldValue) &&
						fieldValue.length === 1 &&
						isUploadFileLike(fieldValue[0])
					) {
						fieldValue = fieldValue[0];
					} else if (
						(expectedType === "files" || isMultipleFilesRule(rule)) &&
						!Array.isArray(fieldValue) &&
						isUploadFileLike(fieldValue)
					) {
						fieldValue = [fieldValue];
					}

					if (typeof fieldValue === "string") {
						fieldValue = coerceValue(fieldValue, expectedType);
					}

					objData[key] = fieldValue;

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
							objData[key] = res.data !== undefined ? res.data : fieldValue;
						}
					}
				}

				if (issues.length > 0) {
					return { success: false, issues };
				}

				if (originalWasArray && singleTargetKey) {
					const finalArr = (objData[singleTargetKey] ??
						[]) as unknown as unknown[] & Record<string, unknown>;
					Object.assign(finalArr, objData);
					return { success: true, data: finalArr };
				}

				return { success: true, data: objData };
			}

			return { success: true, data };
		},
	};
}

export function buildRequestValidator(schema: IRouteSchema): MiddlewareHandler {
	const queryValidator = resolveValidator(schema.query, true, false);
	const paramsValidator = resolveValidator(schema.params, true, false);
	const headersValidator = resolveValidator(schema.headers, true, false);
	const bodyValidator = resolveValidator(schema.body, true, false);
	const fileValidator = resolveValidator(schema.file, false, true);
	const filesValidator = resolveValidator(schema.files, false, true);

	return async (req, _res, next) => {
		const issues: ValidationIssue[] = [];

		if (schema.body && req.body === undefined) {
			const contentType = req.headers["content-type"] || "";
			const contentLength = Number(req.headers["content-length"] ?? 0);
			const isChunked = req.headers["transfer-encoding"] !== undefined;

			if (contentLength > 0 || isChunked) {
				try {
					if (
						contentType.includes("application/json") &&
						typeof req.json === "function"
					) {
						req.body = await req.json();
					} else if (
						contentType.includes("application/x-www-form-urlencoded") &&
						typeof req.formData === "function"
					) {
						const formData = await req.formData();
						req.body = Object.fromEntries(formData.entries());
					} else if (typeof req.text === "function") {
						req.body = await req.text();
					}
				} catch (err: unknown) {
					return next(
						new ErrorValidator([
							{
								path: "body",
								rule: "parse_error",
								message: `Failed to parse request body: ${(err as Error).message || "Invalid payload"}`,
							},
						]),
					);
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

		if (filesValidator && req.files !== undefined) {
			const validatedFiles = await processValidator(
				filesValidator,
				req.files,
				"files",
			);

			if (
				Array.isArray(req.files) &&
				!Array.isArray(validatedFiles) &&
				typeof validatedFiles === "object"
			) {
				Object.assign(req.files, validatedFiles);
			} else {
				req.files = validatedFiles as typeof req.files;
			}

			if (
				!req.file &&
				typeof validatedFiles === "object" &&
				validatedFiles !== null
			) {
				const values = Object.values(validatedFiles);
				if (values.length === 1 && isUploadFileLike(values[0])) {
					req.file = values[0] as FileUpload;
				}
			}
		}

		if (issues.length > 0) {
			return next(new ErrorValidator(issues));
		}

		return next();
	};
}
