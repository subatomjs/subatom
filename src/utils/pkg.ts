import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface UserPackageJson {
  type?: "module" | "commonjs";
  name?: string;
}

export function readUserPackageJson(cwd: string = process.cwd()): UserPackageJson {
  const pkgPath = path.join(cwd, "package.json");
  if (!existsSync(pkgPath)) return {};
  return JSON.parse(readFileSync(pkgPath, "utf-8"));
}