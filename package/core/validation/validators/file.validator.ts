// import type { IUploadFile } from "../../../types/framework/pipeline/IUploadFile.js";
// import type {
// 	ISchemaBase,
// 	ValidateFn,
// } from "../../../types/validation/IValidation.js";
// import type { ValidationIssue } from "../ValidationError.js";

// export function compileFileValidator(schema: ISchemaBase): ValidateFn {
// 	const { maxSize, allowedMimeTypes } = schema as any;

// 	return async (value: unknown, path: string) => {
// 		const issues: ValidationIssue[] = [];

// 		// Basic structural check to ensure it's a Subatom IUploadFile
// 		if (
// 			!value ||
// 			typeof value !== "object" ||
// 			!("mimetype" in (value as any))
// 		) {
// 			issues.push({
// 				path,
// 				rule: "type",
// 				message: "Expected a parsed file object",
// 				received: typeof value,
// 			});
// 			return issues;
// 		}

// 		const file = value as IUploadFile;

// 		if (
// 			maxSize !== undefined &&
// 			file.size !== undefined &&
// 			file.size > maxSize
// 		) {
// 			issues.push({
// 				path,
// 				rule: "maxSize",
// 				message: `File size ${file.size} bytes exceeds maximum of ${maxSize} bytes`,
// 				expected: maxSize,
// 				received: file.size,
// 			});
// 		}

// 		if (
// 			Array.isArray(allowedMimeTypes) &&
// 			!allowedMimeTypes.includes(file.mimetype)
// 		) {
// 			issues.push({
// 				path,
// 				rule: "allowedMimeTypes",
// 				message: `MIME type not allowed. Expected one of: ${allowedMimeTypes.join(", ")}`,
// 				expected: allowedMimeTypes,
// 				received: file.mimetype,
// 			});
// 		}

// 		return issues;
// 	};
// }


import type {
  ISchemaBase,
  ValidateFn,
} from "../../../types/validation/IValidation.js";
import type { ValidationIssue } from "../ValidationError.js";

export function compileFileValidator(
  schema: ISchemaBase,
): ValidateFn {
  return async (
    value: unknown,
    path: string,
  ): Promise<ValidationIssue[]> => {
    if (
      !schema ||
      typeof (schema as any).safeParse !== "function"
    ) {
      return [
        {
          path,
          rule: "validation",
          message: "Invalid file validation schema",
          received: schema,
        },
      ];
    }

    const result = await (schema as any).safeParse(value);

    if (result.success) {
      return [];
    }

    const schemaIssues =
      result.issues ??
      result.error?.issues ??
      result.error?.details ??
      [];

    if (!Array.isArray(schemaIssues)) {
      return [
        {
          path,
          rule: "validation",
          message:
            result.error?.message ??
            "File validation failed",
          received: value,
        },
      ];
    }

    return schemaIssues.map((issue: any) => ({
      path: issue.path
        ? `${path}.${Array.isArray(issue.path)
            ? issue.path.join(".")
            : issue.path}`
        : path,
      rule:
        issue.code ??
        issue.rule ??
        "validation",
      message:
        issue.message ??
        "File validation failed",
      received: issue.received,
      expected: issue.expected,
    }));
  };
}