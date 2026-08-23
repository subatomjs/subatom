const { Router, file } = require("subatom");
const {infer} = require("subatom-infer")
const postController = require("../controllers/post.controller.js");
const getController = require("../controllers/get.controller.js");
const putController = require("../controllers/put.controller.js");
const patchController = require("../controllers/patch.controller.js");
const deleteController = require("../controllers/delete.controller.js");
const queryController = require("../controllers/query.controller.js");
const {
  postBodySchema,
  putBodySchema,
  patchBodySchema,
  queryBodySchema,
} = require("./router.schema.js");

const httpRouter = new Router();

// // 1. Post new data
// httpRouter.post("/data", postController, {
//   name: "http_router.post",
//   tags: ["Http Operations"],
//   schema: postBodySchema,
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
// });

// // 4. Update data
// httpRouter.put("/data/:id", putController, {
//   name: "http_router.update",
//   tags: ["Http Operations"],
//   schema: putBodySchema,
// });

// // 5. Edit data
// httpRouter.patch("/data/:id", patchController, {
//   name: "http_router.edit",
//   tags: ["Http Operations"],
//   schema: patchBodySchema,
// });

// // 6. Delete data
// httpRouter.delete("/data/:id", deleteController, {
//   name: "http_router.delete",
//   tags: ["Http Operations"],
// });

// // 7. Query data (HTTP QUERY method with request body)
// httpRouter.query("/data", queryController, {
//   name: "http_router.query",
//   tags: ["Http Operations"],
//   schema: queryBodySchema,
// });



httpRouter.post("/data", file.single("avatar", {
    storage: "disk",
    dest: "./uploads",
    allowedMimeTypes: ["image/jpeg", "image/webp"],
  }), postController, {
  name: "http_router.post",
  tags: ["Http Operations"],
  schema: {
    query: infer.object({
      notify: infer.coerce.boolean().default(false),
    }),
    // Use `file` instead of `files` since `file.single(...)` populates req.file
    file: infer.object({
      fieldname: infer.string(),
      originalname: infer.string(),
      mimetype: infer.string(),
      size: infer.number(),
    }),
    body: infer.object({
      name: infer.string().min(1),
      email: infer.string().email(),
      age: infer.coerce.number(),
    }),
  },
});


module.exports = httpRouter;
