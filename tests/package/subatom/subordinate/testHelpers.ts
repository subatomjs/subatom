// tests/unit/subordinate/testHelpers.ts
import { vi } from "vitest";
import type { Subatom } from "../../../../package/core/bootstrap/subatom/Subatom.js";
import type { IGroupContext } from "../../../../package/types/framework/core/IFrameworkCore.js";

export function createMockApp(initialContext?: IGroupContext) {
	const stack: IGroupContext[] = initialContext ? [initialContext] : [];

	return {
		_currentGroupContext: vi.fn(() => stack[stack.length - 1]),
		_pushGroupContext: vi.fn((ctx: IGroupContext) => {
			stack.push(ctx);
		}),
		_popGroupContext: vi.fn(() => {
			stack.pop();
		}),
		_registerGroupRoute: vi.fn(),
		// Expose stack for internal verification
		_contextStack: stack,
	} as unknown as Subatom & {
		_currentGroupContext: ReturnType<typeof vi.fn>;
		_pushGroupContext: ReturnType<typeof vi.fn>;
		_popGroupContext: ReturnType<typeof vi.fn>;
		_registerGroupRoute: ReturnType<typeof vi.fn>;
		_contextStack: IGroupContext[];
	};
}
