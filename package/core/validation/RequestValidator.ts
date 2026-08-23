// subatom/package/core/validation/buildRequestValidator.ts

import type { IRouteSchema } from "../../types/framework/router/IRouter.js";
import type { MiddlewareHandler } from "../../types/http/IMiddleware.js";
import { ValidationError, type ValidationIssue } from "./ValidationError.js";

/**
 * Normalizes a schema part into a uniform validator with an async safeParse method.
 * Handles both direct schema instances and plain object rule maps (e.g., schema.body).
 */
function resolveValidator(schemaPart: unknown) {
  if (!schemaPart) return null;

  // Case 1: Already has safeParse (e.g., infer.object(...) or compiled schemas)
  if (typeof (schemaPart as any).safeParse === "function") {
    return schemaPart as { safeParse: (val: unknown) => Promise<any> | any };
  }

  // Case 2: Plain object mapping field names to subatom-infer rules (e.g., body: { email: infer.string().email() })
  if (typeof schemaPart === "object" && schemaPart !== null) {
    const rules = schemaPart as Record<string, any>;
    return {
      safeParse: async (targetVal: unknown) => {
        if (!targetVal || typeof targetVal !== "object" || Array.isArray(targetVal)) {
          return {
            success: false,
            issues: [{
              path: "body",
              rule: "type",
              message: "Expected object",
              received: typeof targetVal,
            } as ValidationIssue]
          };
        }

        const data = { ...(targetVal as Record<string, any>) };
        const issues: ValidationIssue[] = [];

        for (const [key, rule] of Object.entries(rules)) {
          const fieldValue = data[key];
          if (rule && typeof rule.safeParse === "function") {
            const res = await rule.safeParse(fieldValue);
            if (!res.success) {
              const subIssues = res.error?.details || res.error?.issues || [
                {
                  path: key,
                  rule: "validation",
                  message: res.error?.message || `Validation failed for field '${key}'`,
                  received: fieldValue,
                }
              ];
              
              for (const sub of subIssues) {
                issues.push({
                  path: sub.path ? `${key}.${sub.path}` : key,
                  rule: sub.rule || "validation",
                  message: sub.message || `Invalid value for ${key}`,
                  received: sub.received !== undefined ? sub.received : fieldValue,
                  expected: sub.expected,
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
      }
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

    async function processValidator(validator: any, targetData: unknown, defaultPath: string) {
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
      }
      return result.data !== undefined ? result.data : targetData;
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