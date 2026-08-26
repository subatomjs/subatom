import { Router, file } from "subatom";
import { authMiddleware } from "./auth.middleware.js";
import {
  createUserSchema,
  getUserSchema,
  listUsersSchema,
} from "./user.schema.js";
import {
  createUserController,
  deleteUserController,
  getUserController,
  listUsersController,
  updateUserController,
} from "./user.controller.js";

export const userRouter = new Router();

// ============================================================
// 1. Single Options Route Registration
// ============================================================

userRouter.post("/orgs/:orgId/users", {
  name: "users.create",
  tags: ["Users"],
  schema: createUserSchema,
  middleware: [
    file.single("avatar", {
      storage: "memory",
      allowedMimeTypes: ["image/webp", "image/jpeg", "image/png"],
    }),
    // authMiddleware,
  ],
  controller: createUserController,
});

// ============================================================
// 2. Route Grouping - Style 1 (Callback-Driven)
// ============================================================
userRouter.group("/v1/members", {
  name: "members",
  tags: ["Members"],
  middleware: [authMiddleware],
  routes: (router) => {
    router.get("/", {
      name: "list",
      schema: listUsersSchema,
      controller: listUsersController,
    });

    router.get("/:id", {
      name: "get",
      schema: getUserSchema,
      controller: getUserController,
    });
  },
});

// ============================================================
// 3. Route Grouping - Style 2 (Instance / Fluent-Driven)
// ============================================================
const adminGroup = userRouter.group("/admin/users", {
  name: "admin.users",
  tags: ["Admin Users"],
  middleware: [authMiddleware],
});

adminGroup.get("/", {
  name: "list",
  schema: listUsersSchema,
  controller: listUsersController,
});

adminGroup.delete("/:id", {
  name: "delete",
  schema: getUserSchema,
  controller: deleteUserController,
});

// ============================================================
// 4. Resource Routing
// ============================================================
userRouter.resource("/profiles", {
  controller: {
    index: listUsersController,
    show: getUserController,
    create: createUserController,
    update: updateUserController,
    delete: deleteUserController,
  },
  middleware: [authMiddleware],
  tags: ["User Profiles"],
  only: ["index", "show", "create", "update", "delete"],
  names: {
    index: "profiles.list",
    show: "profiles.get",
    create: "profiles.create",
    update: "profiles.update",
    delete: "profiles.delete",
  },
});