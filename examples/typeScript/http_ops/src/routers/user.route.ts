import { type IRouter, Router, RouteArgument, file } from "subatom";
import addNewUserCtrl from "../controllers/users/addNewUser.controller.js";
import infer from "subatom-infer";
import updateUserController from "../controllers/users/updateUser.controller.js";

const userRouter:IRouter = new Router();

export const addUserSchema = {
  file: infer
    .file()
    .mime(["image/webp", "image/jpeg", "image/png"])
    .max(5 * 1024 * 1024),
  body: {
    userName: infer.string(),
    emailId: infer.string().email(),
    fullName: infer.string(),
    age: infer.string(),
  },
};

export const updateUserSchema = {
  params: infer.object({
    id: infer.string().uuid(),
  }),
  file: infer
    .file()
    .mime(["image/webp", "image/jpeg", "image/png"])
    .max(5 * 1024 * 1024)
    .optional(),
  body: {
    userName: infer.string().optional(),
    emailId: infer.string().email().optional(),
    fullName: infer.string().optional(),
    age: infer.string().optional(),
  },
};


//* 1. Add New User ...
userRouter.post(
  "/user",
  file.single("avatar", {
    storage: "memory",
    // dest: "./uploads",
    allowedMimeTypes: ["image/webp", "image/jpeg", "image/png"],
  }) as RouteArgument,
  addNewUserCtrl,
  {
    name: "add.new.user",
    tags: ["Users"],
    schema: addUserSchema,
  },
);

//todo: 2. Put Operation
userRouter.put(
  "/user/:id",
  file.single("avatar", {
    storage: "memory",
    dest: "./uploads",
    allowedMimeTypes: ["image/webp", "image/jpeg", "image/png"],
  }) as RouteArgument,
updateUserController,
  {
    name: "update.new.user",
    tags: ["Users"],
    schema: updateUserSchema,
  },
);



export default userRouter;




// userRouter.post("/user", {
//   name: "update.new.user",
//   tags: ["Users"],
//   schema:{
//     files: infer.file(),
//     body:{
//     userName: infer.string(),
//     emailId: infer.string().email(),
//     fullName: infer.string(),
//     age: infer.string(),
//     },


//   },

//   middleware: [someMiddleware, somefileHandler],
//   controller: addNewUserCtrl
// })