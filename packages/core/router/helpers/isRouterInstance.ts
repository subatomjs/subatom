/**
 * @fileoverview Checks whether a value is a Router-like instance by
 * verifying its getRoutes() and dispatch() methods.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { Router } from "../Router.js";
import type { IRouter } from "../types/router.types.js";

function isRouterInstance(x: unknown): x is Router {
	return (
		!!x &&
		typeof (x as IRouter).getRoutes === "function" &&
		typeof (x as Router).dispatch === "function"
	);
}
export default isRouterInstance;
