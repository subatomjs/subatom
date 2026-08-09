/**
 * Asynchronously pause execution for the given duration.
 *
 * @example
 * await sleep(1000);              // wait 1 second
 * await sleep.until(someDate);    // wait until a specific Date
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/** Sleep until a specific point in time (no-op if it's already passed). */
sleep.until = function until(date: Date): Promise<void> {
  return sleep(date.getTime() - Date.now());
};

/**
 * Like `sleep`, but rejects early if the given AbortSignal is aborted —
 * useful for cancellable delays (e.g. tied to a request's lifecycle).
 */
sleep.abortable = function abortable(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error('Aborted'));

    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, Math.max(0, ms));

    function onAbort() {
      clearTimeout(timer);
      reject(new Error('Aborted'));
    }

    signal.addEventListener('abort', onAbort, { once: true });
  });
};