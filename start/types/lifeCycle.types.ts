export type ProcessSignal = "SIGINT" | "SIGTERM";

export type ShutdownHook = (
	signalOrError?: ProcessSignal | Error | undefined,
) => Promise<void> | void;

export interface LifecycleRegistration {
	readonly unregister: () => void;
}

export interface ProcessStateStatus {
	readonly isRunning: boolean;
	readonly isRestarting: boolean;
	readonly isDisposed: boolean;
	readonly pid?: number | undefined;
}
