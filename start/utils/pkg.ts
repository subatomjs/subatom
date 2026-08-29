/**
 * @fileoverview responsible for read package.json
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface UserPackageJson {
	type?: "module" | "commonjs";
	name?: string;
}

export function readUserPackageJson(
	cwd: string = process.cwd(),
): UserPackageJson {
	const pkgPath = path.join(cwd, "package.json");
	if (!existsSync(pkgPath)) return {};
	return JSON.parse(readFileSync(pkgPath, "utf-8"));
}
