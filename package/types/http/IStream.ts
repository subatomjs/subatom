/**
 * Shared types and error classes for the streaming module. Kept
 * dependency-free (no node:http imports) so they can be imported from
 * both server and shared/isomorphic code if needed later.
 */

export interface StreamPipeOptions {
	/**
	 * Abort signal that cancels the stream. Typically tied to a request
	 * timeout, an upstream fetch's controller, or manual cancellation.
	 */
	signal?: AbortSignal;
	/**
	 * Called when the stream fails - either because the source errored,
	 * or because it was aborted/disconnected. Distinguish the two via
	 * `error instanceof StreamAbortedError`.
	 */
	onError?: (error: Error) => void;
	/** Called once the stream has been fully flushed to the client. */
	onFinish?: () => void;
	/**
	 * Called if the client disconnects before the stream finishes. Fires
	 * in addition to (before) `onError` with a StreamAbortedError.
	 */
	onClientDisconnect?: () => void;
}

export interface RangeSpec {
	start: number;
	end: number; // inclusive
}

/**
 * Raised when a stream is torn down because the client disconnected or
 * an AbortSignal fired - i.e. not a "real" failure of the data source.
 */
export class StreamAbortedError extends Error {
	constructor(message = "Stream aborted by client or signal") {
		super(message);
		this.name = "StreamAbortedError";
	}
}

/** Raised when a `Range` request header can't be satisfied for the resource. */
export class RangeNotSatisfiableError extends Error {
	constructor(public readonly size: number) {
		super(`Range not satisfiable for resource of size ${size}`);
		this.name = "RangeNotSatisfiableError";
	}
}
