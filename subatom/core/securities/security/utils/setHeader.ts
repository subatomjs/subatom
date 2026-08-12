import { ServerResponse } from "http";

export function setHeader(
  res: ServerResponse | any,
  name: string,
  value: string,
): void {
  if (!res || typeof res.setHeader !== "function") return;
  if (res.headersSent) return;

  if (Array.isArray(value)) {
    res.setHeader(name, value);
  } else {
    res.setHeader(name, String(value));
  }
}

export function removeHeader(res: ServerResponse | any, name: string): void {
  if (!res || typeof res.removeHeader !== "function") return;
  if (res.headersSent) return;

  res.removeHeader(name);
}
