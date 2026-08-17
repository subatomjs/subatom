import { env } from "../../../../config/env/env.js";
import type { SubatomServer } from "../../subatom-server/SubatomServer.js";

interface ProcessBoundaryEntry {
    readonly getServerInstance: () => SubatomServer | undefined;
    readonly shutdownAction: (code: number) => void;
}

const registeredBoundaries = new Set<ProcessBoundaryEntry>();
let isProcessBoundaryRegistered = false;

function ensureGlobalProcessListeners(): void {
    if (isProcessBoundaryRegistered) {
        return;
    }
    isProcessBoundaryRegistered = true;

    process.on("unhandledRejection", (reason: unknown) => {
        let recovered = false;

        for (const entry of registeredBoundaries) {
            const server = entry.getServerInstance();
            if (server?.tryRecoverFromOrphanedRejection(reason)) {
                recovered = true;
                break;
            }
        }

        if (recovered) {
            return;
        }

        console.error(
            "\n🔥 [Subatom Process Error] Unhandled Promise Rejection Detected:",
        );
        if (reason instanceof Error) {
            console.error(reason.stack ?? reason.message);
        } else {
            console.error(reason);
        }
    });

    process.on("uncaughtException", (error: Error) => {
        console.error("\n💥 [Subatom Fatal Error] Uncaught Synchronous Exception:");
        console.error(error.stack ?? error.message);

        if (env.isProd) {
            console.error("Initiating emergency graceful shutdown...");
            const entries = Array.from(registeredBoundaries);
            for (const entry of entries) {
                try {
                    entry.shutdownAction(1);
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    console.error(`[Subatom] Error during emergency shutdown: ${message}`);
                }
            }
        }
    });

    const handleSignal = (exitCode: number) => {
        const entries = Array.from(registeredBoundaries);
        registeredBoundaries.clear();

        for (const entry of entries) {
            try {
                entry.shutdownAction(exitCode);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.error(`[Subatom] Error during signal shutdown: ${message}`);
            }
        }
    };

    process.once("SIGINT", () => handleSignal(0));
    process.once("SIGTERM", () => handleSignal(0));
}

export function registerProcessBoundary(
    getServerInstance: () => SubatomServer | undefined,
    shutdownAction: (code: number) => void,
): () => void {
    ensureGlobalProcessListeners();

    const entry: ProcessBoundaryEntry = {
        getServerInstance,
        shutdownAction,
    };

    registeredBoundaries.add(entry);

    return () => {
        registeredBoundaries.delete(entry);
    };
}