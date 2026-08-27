import type { IController } from "subatom";
import type {
  createUserSchema,
  getUserSchema,
  listUsersSchema,
} from "./user.schema.js";

export const createUserController: IController<
  typeof createUserSchema
> = async (ctx) => {
  console.log("ctx", ctx);
  // Fully inferred types from createUserSchema
  const { orgId } = ctx.params;
  const { notify } = ctx.query;
  const { userName, emailId, fullName, age } = ctx.body;
  const avatarFile = ctx.files?.avatar;

  const createdUser = {
    id: crypto.randomUUID(),
    orgId,
    userName,
    emailId,
    fullName,
    age,
    avatar: avatarFile ? avatarFile.filename : null,
    notified: notify ?? false,
    createdBy: ctx.user?.id,
  };

  return ctx.status(201).json({
    success: true,
    data: createdUser,
  });
};

export const getUserController: IController<typeof getUserSchema> = async (
  ctx,
) => {
  const { id } = ctx.params;

  return ctx.status(200).json({
    success: true,
    data: {
      id,
      userName: "kunal",
      emailId: "kunal@example.com",
    },
  });
};

export const listUsersController: IController<typeof listUsersSchema> = async (
  ctx,
) => {
  const { page, limit, search } = ctx.query;

  return ctx.status(200).json({
    success: true,
    page,
    limit,
    search: search ?? null,
    data: [],
  });
};

export const updateUserController: IController = async (ctx) => {
  return ctx.status(200).json({
    success: true,
    message: `User ${ctx.params.id} updated`,
    payload: ctx.body,
  });
};

export const deleteUserController: IController = async (ctx) => {
  return ctx.status(200).json({
    success: true,
    message: `User ${ctx.params.id} deleted`,
  });
};
