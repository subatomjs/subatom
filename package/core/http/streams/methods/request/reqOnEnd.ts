import type { IncomingMessage } from "node:http";

export type EndListener = () => void;

/**
 * Attaches an 'end' listener to the request stream.
 * Returns an unsubscription function.
 */
export function reqOnEnd(
	req: IncomingMessage,
	listener: EndListener,
): () => void {
	req.once("end", listener);

	return (): void => {
		req.off("end", listener);
	};
}
