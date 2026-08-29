/**
 * @fileoverview subatom native random method for generate random string, number, boolean, item and shuffle.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { randomBytes, randomInt } from "node:crypto";
import type { RandomFn } from "./types/methods.types.js";

const DEFAULT_CHARSET =
	"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function baseRandom(min = 0, max = 1): number {
	if (Number.isInteger(min) && Number.isInteger(max)) {
		return randomInt(min, max + 1);
	}
	return Math.random() * (max - min) + min;
}

export const random: RandomFn = Object.assign(baseRandom, {
	int(min: number, max: number): number {
		return randomInt(min, max + 1);
	},

	string(length = 16, charset: string = DEFAULT_CHARSET): string {
		const bytes = randomBytes(length);
		let out = "";
		const charsetLen = charset.length;

		for (let i = 0; i < length; i++) {
			const byte = bytes[i] ?? 0;
			out += charset.charAt(byte % charsetLen);
		}
		return out;
	},

	bool(probability = 0.5): boolean {
		return Math.random() < probability;
	},

	item<T>(arr: readonly T[]): T {
		if (arr.length === 0) {
			throw new Error("random.item() called with an empty array");
		}
		const index = randomInt(0, arr.length);
		return arr[index] as T;
	},

	shuffle<T>(arr: readonly T[]): T[] {
		const result = [...arr];
		for (let i = result.length - 1; i > 0; i--) {
			const j = randomInt(0, i + 1);
			const current = result[i];
			const target = result[j];

			if (current !== undefined && target !== undefined) {
				result[i] = target;
				result[j] = current;
			}
		}
		return result;
	},
});
