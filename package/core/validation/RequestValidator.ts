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
    return !isNaN(num) && trimmed !== "" ? num : value;
  }

  if (expectedType === "boolean") {
    if (trimmed.toLowerCase() === "true" || trimmed === "1") return true;
    if (trimmed.toLowerCase() === "false" || trimmed === "0") return false;
  }

  // Smart fallback when expectedType is unknown
  if (trimmed.toLowerCase() === "true") return true;
  if (trimmed.toLowerCase() === "false") return false;
  if (!isNaN(Number(trimmed)) && trimmed !== "") return Number(trimmed);

  return value;
}

function autoCoerceObject(
  data: Record<string, any>,
  rulesMap?: Record<string, any>,
): Record<string, any> {
  const result: Record<string, any> = { ...data };

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

function resolveValidator(schemaPart: unknown, shouldAutoCoerce = false) {
  if (!schemaPart) return null;

  const rulesMap =
    typeof schemaPart === "object" && schemaPart !== null
      ? ((schemaPart as any).shape ??
        (schemaPart as any)._def?.shape?.() ??
        (schemaPart as any)._def?.shape ??
        (typeof (schemaPart as any).safeParse !== "function"
          ? schemaPart
          : undefined))
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

      // Automatically cast string values to numbers/booleans for query, params, and multipart
      let data = shouldAutoCoerce
        ? autoCoerceObject(targetVal as Record<string, any>, rulesMap)
        : { ...(targetVal as Record<string, any>) };

      // Case 1: Schema has its own validator instance (.safeParse)
      if (typeof (schemaPart as any).safeParse === "function") {
        const res = await (schemaPart as any).safeParse(data);
        if (!res.success) {
          const rawIssues =
            res.issues || res.error?.issues || res.error?.details || [];
          const issues: ValidationIssue[] = rawIssues.map((sub: any) => ({
            path: formatIssuePath("", sub.path),
            rule: sub.rule || sub.code || "invalid_type",
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
      const rules = schemaPart as Record<string, any>;
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

      if (issues.length > 0) {
        return { success: false, issues };
      }

      return { success: true, data };
    },
  };
}

export function buildRequestValidator(schema: IRouteSchema): MiddlewareHandler {
  // Query, params, and headers are always received as strings over HTTP — autoCoerce = true
  const queryValidator = resolveValidator(schema.query, true);
  const paramsValidator = resolveValidator(schema.params, true);
  const headersValidator = resolveValidator(schema.headers, true);
  const bodyValidator = resolveValidator(schema.body, true);
  const fileValidator = resolveValidator(schema.file, false);
  const filesValidator = resolveValidator(schema.files, false);

  return async (req, res, next) => {
    const issues: ValidationIssue[] = [];

    // Merge & normalize multipart parsed files into req.body
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
