import type { IContextMiddleware } from "subatom";

export const authMiddleware: IContextMiddleware = async (ctx, next) => {
  console.log("ctx", ctx)
  const token = ctx.get("authorization");

  if (!token || !token.startsWith("Bearer ")) {
    return ctx.status(401).json({
      success: false,
      message: "Missing or invalid authentication token",
    });
  }

  // Simulate token resolution and attach user state directly to context
  ctx.user = { id: "usr_12345", role: "admin" };
  ctx.locals.requestId = ctx.get("x-request-id") || crypto.randomUUID();

  await next();
};