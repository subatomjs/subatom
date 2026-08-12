import type {
  CompressionAlgorithm,
  NegotiatedEncoding,
} from "../../../types/http/ICompression.js";
import { parseQValue } from "./utils.js";

export function negotiateEncoding(
  acceptEncodingHeader: string | undefined,
  serverAlgorithms: CompressionAlgorithm[],
): NegotiatedEncoding {
  if (acceptEncodingHeader === undefined) {
    const preferred = serverAlgorithms.find(
      (algorithm) => algorithm !== "identity",
    );

    if (preferred) {
      return {
        algorithm: preferred,
        qValue: 1,
        acceptable: true,
      };
    }

    return {
      algorithm: "identity",
      qValue: 1,
      acceptable: true,
    };
  }

  if (acceptEncodingHeader.trim() === "") {
    return {
      algorithm: "identity",
      qValue: 1,
      acceptable: true,
    };
  }

  const preferences = new Map<string, number>();

  for (const rawEntry of acceptEncodingHeader.split(",")) {
    const entry = rawEntry.trim();

    if (!entry) {
      continue;
    }

    const parts = entry.split(";");
    const encoding = parts[0]?.trim().toLowerCase();

    if (!encoding) {
      continue;
    }

    let q = 1;

    for (let i = 1; i < parts.length; i++) {
      const parameter = parts[i]?.trim();

      if (!parameter) {
        continue;
      }

      const separator = parameter.indexOf("=");

      if (separator === -1) {
        continue;
      }

      const name = parameter.slice(0, separator).trim().toLowerCase();

      if (name !== "q") {
        continue;
      }

      const rawQ = parameter.slice(separator + 1).trim();

      q = parseQValue(rawQ) ?? 0;

      break;
    }

    const previous = preferences.get(encoding);

    if (previous === undefined || q > previous) {
      preferences.set(encoding, q);
    }
  }

  const wildcardQ = preferences.get("*");
  const hasExplicitIdentity = preferences.has("identity");

  const identityQ = hasExplicitIdentity
    ? (preferences.get("identity") ?? 0)
    : wildcardQ === 0
      ? 0
      : 1;

  const getEncodingQ = (algorithm: CompressionAlgorithm): number => {
    const explicit = preferences.get(algorithm);

    if (explicit !== undefined) {
      return explicit;
    }

    if (wildcardQ !== undefined) {
      return wildcardQ;
    }

    return 0;
  };

  let bestCompression: CompressionAlgorithm | undefined;
  let bestCompressionQ = 0;

  for (const algorithm of serverAlgorithms) {
    if (algorithm === "identity") {
      continue;
    }

    const q = getEncodingQ(algorithm);

    if (q > 0 && q > bestCompressionQ) {
      bestCompression = algorithm;
      bestCompressionQ = q;
    }
  }

  if (bestCompression) {
    if (hasExplicitIdentity && identityQ > bestCompressionQ) {
      return {
        algorithm: "identity",
        qValue: identityQ,
        acceptable: identityQ > 0,
      };
    }

    return {
      algorithm: bestCompression,
      qValue: bestCompressionQ,
      acceptable: true,
    };
  }

  if (identityQ > 0) {
    return {
      algorithm: "identity",
      qValue: identityQ,
      acceptable: true,
    };
  }

  return {
    algorithm: "identity",
    qValue: 0,
    acceptable: false,
  };
}
