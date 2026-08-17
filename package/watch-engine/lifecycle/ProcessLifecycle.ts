import type {
  LifecycleRegistration,
  ProcessSignal,
  ShutdownHook,
} from "../../types/engine-utils/LifecycleTypes.js";
import { logger } from "../utils/logger.js";

type SignalListener = (signal: NodeJS.Signals) => void;
type ErrorListener = (error: Error) => void;
type RejectionListener = (reason: unknown, promise: Promise<unknown>) => void;

export class ProcessLifecycle {
  private static instance: ProcessLifecycle | null = null;

  private readonly hooks = new Set<ShutdownHook>();
  private isShuttingDown = false;
  private isInitialized = false;

  private sigintListener: SignalListener | null = null;
  private sigtermListener: SignalListener | null = null;
  private uncaughtExceptionListener: ErrorListener | null = null;
  private unhandledRejectionListener: RejectionListener | null = null;

  private constructor() {}

  public static getInstance(): ProcessLifecycle {
    if (!ProcessLifecycle.instance) {
      ProcessLifecycle.instance = new ProcessLifecycle();
    }
    return ProcessLifecycle.instance;
  }

  public static resetInstanceForTesting(): void {
    if (ProcessLifecycle.instance) {
      ProcessLifecycle.instance.unregisterListeners();
      ProcessLifecycle.instance = null;
    }
  }

  public initialize(): void {
    if (this.isInitialized) {
      return;
    }
    this.isInitialized = true;

    this.sigintListener = () => {
      void this.handleShutdown("SIGINT");
    };
    this.sigtermListener = () => {
      void this.handleShutdown("SIGTERM");
    };
    this.uncaughtExceptionListener = (error: Error) => {
      logger.error(`Uncaught Exception: ${error.stack ?? error.message}`);
      void this.handleShutdown(error);
    };
    this.unhandledRejectionListener = (reason: unknown) => {
      const message =
        reason instanceof Error
          ? (reason.stack ?? reason.message)
          : String(reason);
      logger.error(`Unhandled Rejection: ${message}`);
      void this.handleShutdown(
        reason instanceof Error ? reason : new Error(message),
      );
    };

    process.once("SIGINT", this.sigintListener);
    process.once("SIGTERM", this.sigtermListener);
    process.on("uncaughtException", this.uncaughtExceptionListener);
    process.on("unhandledRejection", this.unhandledRejectionListener);
  }

  public onShutdown(hook: ShutdownHook): LifecycleRegistration {
    this.initialize();
    this.hooks.add(hook);
    return {
      unregister: () => {
        this.hooks.delete(hook);
      },
    };
  }

  public async handleShutdown(
    signalOrError?: ProcessSignal | Error,
  ): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }
    this.isShuttingDown = true;

    const hooksToExecute = Array.from(this.hooks);
    this.hooks.clear();

    for (const hook of hooksToExecute) {
      try {
        await hook(signalOrError);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`Error during lifecycle shutdown hook: ${message}`);
      }
    }

    this.unregisterListeners();

    if (signalOrError instanceof Error) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }

  private unregisterListeners(): void {
    if (this.sigintListener) {
      process.removeListener("SIGINT", this.sigintListener);
      this.sigintListener = null;
    }
    if (this.sigtermListener) {
      process.removeListener("SIGTERM", this.sigtermListener);
      this.sigtermListener = null;
    }
    if (this.uncaughtExceptionListener) {
      process.removeListener(
        "uncaughtException",
        this.uncaughtExceptionListener,
      );
      this.uncaughtExceptionListener = null;
    }
    if (this.unhandledRejectionListener) {
      process.removeListener(
        "unhandledRejection",
        this.unhandledRejectionListener,
      );
      this.unhandledRejectionListener = null;
    }
    this.isInitialized = false;
  }
}
