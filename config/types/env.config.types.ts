/**
 * @fileoverview env config type provider.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

export interface IEnvOptions {
	path?: string;
	encoding?: BufferEncoding;
	override?: boolean;
	strict?: boolean;
}
