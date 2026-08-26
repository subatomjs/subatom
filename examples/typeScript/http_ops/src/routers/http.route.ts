import { file, type IRouter, RouteArgument, Router } from "subatom";
import { infer } from "subatom-infer";
import { handleGalleryController } from "../controllers/post.controller.js";

const httpRouter: IRouter = new Router();

const postSchema = {
  params: infer.object({
    id: infer.string().uuid(),
  }),
  file: infer.object({
    filename: infer.string(),
    mimetype: infer.enum(["image/jpeg", "image/png"]),
    size: infer.number().max(5 * 1024 * 1024), // 5MB limit
  }),
  body: {
    name: infer.string().min(1),
    email: infer.string().email(),
    age: infer.coerce.number(),
  },
};

const gallarySchema = {
  files: infer.array(
    // Call as a function with zero arguments based on your type definition
    infer.file(),
  ),
  body: infer.object({
    name: infer.string().min(1),
    email: infer.string().email(),
    age: infer.coerce.number(),
  }),
};

httpRouter.post(
  "/users/:id/avatar",
  file.single("avatar", {
    storage: "memory",
    allowedMimeTypes: ["image/jpeg", "image/png"],
  }) as RouteArgument,
  async (req, res) => {
    // req.file and req.params are fully validated and typed here
    const { id } = req.params;
    const avatarFile = req.file;

    res.json({
      message: `Avatar uploaded successfully for user ${id}`,
      filename: avatarFile?.filename,
      size: avatarFile?.size,
    });
  },
  {
    name: "users.uploadAvatar",
    tags: ["Users"],
    schema: postSchema,
  },
);

httpRouter.post(
  "/users/data",
  async (req, res) => {
    // req.file and req.params are fully validated and typed here
    const { id } = req.params;
    const avatarFile = req.file;

    res.json({
      message: `Avatar uploaded successfully for user ${id}`,
      filename: avatarFile?.filename,
      size: avatarFile?.size,
    });
  },
  {
    name: "users.upload-data",
    tags: ["Users"],
    schema: {
      body: {
        name: infer.string().min(1),
        email: infer.string().email(),
        age: infer.coerce.number(),
        mobile: infer.string().min(10),
      },
    },
  },
);

httpRouter.post(
  "/gallary",
  file.array("photos", 5, {
    storage: "disk",
    dest: "./uploads",
    allowedMimeTypes: ["image/webp", "image/jpeg", "image/png"],
  }) as RouteArgument,
  handleGalleryController,
  {
    name: "users.upload-gallary",
    tags: ["Gallary"],
    schema: gallarySchema,
  },
);

httpRouter.post(
  "/documents",
  file.fields(
    [
      { name: "document", maxCount: 1 },
      { name: "gallery", maxCount: 3 },
    ],
    { storage: "memory" },
  ) as RouteArgument,
  handleGalleryController,
  {
    name: "document.upload",
    tags: ["Document"],
    schema: {
      // Group your multi-files under the known 'files' schema property
      files: infer.object({
        document: infer.array(infer.file()),
        gallery: infer.array(infer.file()),
      }),

      // Keep your text body inputs here if applicable
      body: infer.object({
        name: infer.string().min(1),
        email: infer.string().email(),
        age: infer.coerce.number(),
      }),
    },
  },
);



export default httpRouter;

// // 1. Post new data with single file upload
// // 1. Post new data with single file upload
// httpRouter.post("/data", file.single("avatar", {
//     storage: "disk",
//     dest: "./uploads",
//     allowedMimeTypes: ["image/jpeg", "image/webp"],
//   }) as RouteArgument, postController, {
//   name: "http_router.post",
//   tags: ["Http Operations"],
//   schema: {
//     query: infer.object({
//       notify: infer.coerce.boolean().default(false),
//     }),
//     file: infer.object({
//       fieldname: infer.string(),
//       originalname: infer.string(),
//       mimetype: infer.string(),
//       size: infer.number(),
//     }),
//     body: infer.object({
//       name: infer.string().min(1),
//       email: infer.string().email(),
//       age: infer.coerce.number(),
//     }),
//   },
// });

// // 2. Get data
// httpRouter.get("/data", getController, {
//   name: "http_router.get",
//   tags: ["Http Operations"],
// });

// // 3. Get data by id
// httpRouter.get("/data/:id", postController, {
//   name: "http_router.get.by.id",
//   tags: ["Http Operations"],
//   schema: {
//     params: infer.object({
//       id: infer.string().uuid(),
//     }),
//   },
// });

// // 4. Update data
// httpRouter.put("/data/:id", putController, {
//   name: "http_router.update",
//   tags: ["Http Operations"],
//   schema: {
//     params: infer.object({
//       id: infer.string().uuid(),
//     }),
//     body: infer.object({
//       application: infer.string(),
//       author: infer.string(),
//       url: infer.string().url(),
//       email: infer.string().email(),
//       bussiness: infer.string(),
//     }),
//   },
// });

// // 5. Edit data
// httpRouter.patch("/data/:id", patchController, {
//   name: "http_router.edit",
//   tags: ["Http Operations"],
//   schema: {
//     params: infer.object({
//       id: infer.string().uuid(),
//     }),
//     body: infer.object({
//       application: infer.string().optional(),
//       author: infer.string().optional(),
//       url: infer.string().url().optional(),
//       email: infer.string().email().optional(),
//       bussiness: infer.string().optional(),
//     }),
//   },
// });

// // 6. Delete data
// httpRouter.delete("/data/:id", deleteController, {
//   name: "http_router.delete",
//   tags: ["Http Operations"],
//   schema: {
//     params: infer.object({
//       id: infer.string().uuid(),
//     }),
//   },
// });

// // 7. Query data (HTTP QUERY method with request body)
// httpRouter.query("/data", queryController, {
//   name: "http_router.query",
//   tags: ["Http Operations"],
//   schema: {
//     body: infer.object({
//       query: infer.string(),
//       filters: infer.record(infer.string(), infer.any()).optional(),
//     }),
//   },
// });
