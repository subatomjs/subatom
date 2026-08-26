import type { IRouteSchema } from "../../types/framework/router/IRouter.js";
import type { MiddlewareHandler } from "../../types/http/IMiddleware.js";
import { UploadFile } from "../pipeline/file-system/UploadFile.js";
import { ValidationError, type ValidationIssue } from "./ValidationError.js";

function isUploadFileLike(val: unknown): boolean {
  if (!val || typeof val !== "object") return false;
  return (
    val instanceof UploadFile ||
    (val as any)._isUploadFile === true ||
    (typeof (val as any).filename === "string" &&
      typeof (val as any).stream === "function")
  );
}

function inspectRuleExpectedType(rule: any): string | undefined {
  if (!rule || (typeof rule !== "object" && typeof rule !== "function")) {
    return undefined;
  }

  // 1. Recursively unwrap inner schema wrappers (optional, nullable, default, effects)
  const inner =
    rule._def?.innerType ??
    rule._def?.schema ??
    rule.innerType ??
    rule.schema ??
    rule._def?.type;

  if (inner && inner !== rule) {
    const unwrapped = inspectRuleExpectedType(inner);
    if (unwrapped) return unwrapped;
  }

  const indicator = String(
    rule.type ??
      rule._type ??
      rule.typeName ??
      rule._def?.typeName ??
      rule._def?.type ??
      rule.name ??
      rule.constructor?.name ??
      "",
  ).toLowerCase();

  if (
    indicator.includes("number") ||
    indicator.includes("integer") ||
    indicator.includes("int") ||
    indicator.includes("float")
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
    return !isNaN(num) && trimmed !== "" ? num : value;
  }

  if (expectedType === "boolean") {
    if (trimmed.toLowerCase() === "true" || trimmed === "1") return true;
    if (trimmed.toLowerCase() === "false" || trimmed === "0") return false;
  }

  return value;
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
    const normalized: Record<string, any> = {};
    for (const [key, val] of Object.entries(files as Record<string, any>)) {
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

function resolveValidator(schemaPart: unknown) {
  if (!schemaPart) return null;

  if (typeof (schemaPart as any).safeParse === "function") {
    return schemaPart as { safeParse: (val: unknown) => Promise<any> | any };
  }

  if (typeof schemaPart === "object" && schemaPart !== null) {
    const rules = schemaPart as Record<string, any>;
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
                path: "body",
                rule: "type",
                message: "Expected object",
                received: typeof targetVal,
              } as ValidationIssue,
            ],
          };
        }

        const data = { ...(targetVal as Record<string, any>) };
        const issues: ValidationIssue[] = [];

        // Inside resolveValidator loop:
        for (const [key, rule] of Object.entries(rules)) {
          let fieldValue = data[key];
          let expectedType = inspectRuleExpectedType(rule);

          // Fallback: If typeof is string, check if it's an explicit boolean literal
          if (typeof fieldValue === "string") {
            const lower = fieldValue.trim().toLowerCase();
            if (lower === "true" || lower === "false") {
              expectedType = expectedType ?? "boolean";
            }
          }

          // 1. Unwrap single-file array if rule expects single file
          if (
            Array.isArray(fieldValue) &&
            fieldValue.length === 1 &&
            expectedType !== "array" &&
            isUploadFileLike(fieldValue[0])
          ) {
            fieldValue = fieldValue[0];
          }

          // 2. Coerce string types
          if (typeof fieldValue === "string" && expectedType) {
            fieldValue = coerceValue(fieldValue, expectedType);
          }

          data[key] = fieldValue;
          if (rule && typeof rule.safeParse === "function") {
            const res = await rule.safeParse(fieldValue);
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
                  rule: sub.rule || sub.code || "invalid_type",
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

        // for (const [key, rule] of Object.entries(rules)) {
        //   let fieldValue = data[key];
        //   const expectedType = inspectRuleExpectedType(rule);

        //   // 1. Unwrap single-file array if the rule expects a single file
        //   if (
        //     Array.isArray(fieldValue) &&
        //     fieldValue.length === 1 &&
        //     expectedType !== "array" &&
        //     isUploadFileLike(fieldValue[0])
        //   ) {
        //     fieldValue = fieldValue[0];
        //   }

        //   // 2. Coerce string types to number/boolean when expected
        //   if (typeof fieldValue === "string" && expectedType) {
        //     fieldValue = coerceValue(fieldValue, expectedType);
        //   }

        //   data[key] = fieldValue;

        // }

        if (issues.length > 0) {
          return { success: false, issues };
        }

        return { success: true, data };
      },
    };
  }

  return null;
}

export function buildRequestValidator(schema: IRouteSchema): MiddlewareHandler {
  const bodyValidator = resolveValidator(schema.body);
  const queryValidator = resolveValidator(schema.query);
  const paramsValidator = resolveValidator(schema.params);
  const headersValidator = resolveValidator(schema.headers);
  const fileValidator = resolveValidator(schema.file);
  const filesValidator = resolveValidator(schema.files);

  return async (req, res, next) => {
    const issues: ValidationIssue[] = [];

    // Merge & normalize multipart parsed files into req.body for unified validation
    if (req.files && typeof req.files === "object") {
      req.files = normalizeFiles(req.files);
      if (
        req.body &&
        typeof req.body === "object" &&
        !Array.isArray(req.body)
      ) {
        for (const [key, val] of Object.entries(
          req.files as Record<string, any>,
        )) {
          if (req.body[key] === undefined) {
            req.body[key] = val;
          } else if (
            Array.isArray(req.body[key]) &&
            req.body[key].length === 1 &&
            isUploadFileLike(req.body[key][0])
          ) {
            req.body[key] = req.body[key][0];
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
        const fileKey = (req as any).fileField || "file";
        if (req.body[fileKey] === undefined) {
          req.body[fileKey] = req.file;
        }
      }
    }

    async function processValidator<T>(
      validator: any,
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
      return next(new ValidationError(issues));
    }

    return next();
  };
}
