import { infer } from "subatom-infer";

export const createUserSchema = {
  params: {
    orgId: infer.uuid(),
  },
  query: {
    notify: infer.boolean().optional(),
  },
  body: {
    userName: infer.string().min(3),
    emailId: infer.string().email(),
    fullName: infer.string(),
    age: infer.number().int().min(18),
  },
  files: {
    avatar: infer.file().max(5 * 1024 * 1024, "Max limit is 5 mega byte."),
  },
};

export const getUserSchema = {
  params: {
    id: infer.uuid(),
  },
};

export const listUsersSchema = {
  query: {
    page: infer.number().int().min(1).default(1),
    limit: infer.number().int().min(1).max(100).default(20),
    search: infer.string().optional(),
  },
};