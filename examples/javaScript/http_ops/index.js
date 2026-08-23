const { Subatom, setupApiDocs, json } = require("subatom");
const httpRouter = require("./src/routers/http.routes.js");

const server = new Subatom();

setupApiDocs(server, {
  title: "Http Application Sample API",
  version: "1.0.0",
});

// Handle root path request.
server.get("/", async (req, res) => {
  res.json("Welcome to subatom http sample.");
});

server.use(json())

// Register http router.
server.use("/api/v1/http/sample", httpRouter)

server.start();
