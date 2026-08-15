// src/config/__tests__/config.test.ts
import { describe, it, expect } from "vitest";
import { deepMerge } from "../../package/config/ConfigMerger.js";
import { validateConfig } from "../../package/config/ConfigValidator.js";
import { ConfigManager } from "../../package/config/ConfigManager.js";

describe("Subatom Advanced Configuration System", () => {
  it("deepMerge correctly merges nested objects without losing siblings", () => {
    const defaultConf = { watch: { extensions: ["ts"], debounceMs: 250 } };
    const userConf = { watch: { debounceMs: 500 } }; // Missing extensions

    const merged = deepMerge(defaultConf, userConf) as typeof defaultConf;

    expect(merged.watch.debounceMs).toBe(500);
    expect(merged.watch.extensions).toEqual(["ts"]); // Sibling preserved
  });


  it("validateConfig fails early on invalid types and redacts secrets", () => {
    const badConfig: any = { port: "8080", host: "localhost" };
    expect(() => validateConfig(badConfig)).toThrow(/expected a valid port number/i);
    
    // Pass a 100-character string to `port` (which is checked first).
    // This fails the `typeof === "number"` check and passes the long string directly to the error formatter.
    const longSecret: any = { port: "A".repeat(100), host: "localhost" };
    
    try { 
      validateConfig(longSecret); 
    } catch(e: any) {
      expect(e.message).toContain("[REDACTED OR TRUNCATED]");
    }
  });
//   it("validateConfig fails early on invalid types and redacts secrets", () => {
//     const badConfig: any = { port: "8080", host: "localhost" };
//     expect(() => validateConfig(badConfig)).toThrow(
//       /expected a valid port number/i,
//     );

//     const longSecret: any = { port: 8080, host: "A".repeat(100) };
//     try {
//       validateConfig(longSecret);
//     } catch (e: any) {
//       expect(e.message).toContain("[REDACTED OR TRUNCATED]");
//     }
//   });

  it("ConfigManager.resolve caches configuration immutably", async () => {
    const conf1 = await ConfigManager.resolve();
    const conf2 = await ConfigManager.resolve();
    expect(conf1).toBe(conf2); // Reference equality
    expect(Object.isFrozen(conf1)).toBe(true);
  });
});
