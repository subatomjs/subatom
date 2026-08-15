import type { IUploadFile } from "../../../types/framework/pipeline/IUploadFile.js";
import type {
	ISchemaBase,
	ValidateFn,
} from "../../../types/validation/IValidation.js";
import type { ValidationIssue } from "../ValidationError.js";

export function compileFileValidator(schema: ISchemaBase): ValidateFn {
	const { maxSize, allowedMimeTypes } = schema as any;

	return async (value: unknown, path: string) => {
		const issues: ValidationIssue[] = [];

		// Basic structural check to ensure it's a Subatom IUploadFile
		if (
			!value ||
			typeof value !== "object" ||
			!("mimetype" in (value as any))
		) {
			issues.push({
				path,
				rule: "type",
				message: "Expected a parsed file object",
				received: typeof value,
			});
			return issues;
		}

		const file = value as IUploadFile;

		if (
			maxSize !== undefined &&
			file.size !== undefined &&
			file.size > maxSize
		) {
			issues.push({
				path,
				rule: "maxSize",
				message: `File size ${file.size} bytes exceeds maximum of ${maxSize} bytes`,
				expected: maxSize,
				received: file.size,
			});
		}

		if (
			Array.isArray(allowedMimeTypes) &&
			!allowedMimeTypes.includes(file.mimetype)
		) {
			issues.push({
				path,
				rule: "allowedMimeTypes",
				message: `MIME type not allowed. Expected one of: ${allowedMimeTypes.join(", ")}`,
				expected: allowedMimeTypes,
				received: file.mimetype,
			});
		}

		return issues;
	};
}
