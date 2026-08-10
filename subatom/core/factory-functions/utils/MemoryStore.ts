import {
  ISessionData,
  ISessionStore,
} from "../../../types/framework/factory-function/ISession.js";

interface Entry {
  data: ISessionData;
  expiresAt: number | null;
}

export class MemoryStore implements ISessionStore {
  private entries = new Map<string, Entry>();

  async get(sid: string): Promise<ISessionData | null> {
    const entry = this.entries.get(sid);
    if (!entry) return null;

    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      this.entries.delete(sid);
      return null;
    }

    return entry.data;
  }

  async set(sid: string, data: ISessionData, maxAgeMs?: number): Promise<void> {
    this.entries.set(sid, {
      data,
      expiresAt: typeof maxAgeMs === "number" ? Date.now() + maxAgeMs : null,
    });
  }

  async destroy(sid: string): Promise<void> {
    this.entries.delete(sid);
  }

  async touch(sid: string, maxAgeMs?: number): Promise<void> {
    const entry = this.entries.get(sid);
    if (!entry) return;
    entry.expiresAt =
      typeof maxAgeMs === "number" ? Date.now() + maxAgeMs : null;
  }
}
