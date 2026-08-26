import { Subatom, setupApiDocs, json, IRequest, IResponse, cors } from "subatom";
import {userRouter} from "./v2/user.routes.js";

const server = new Subatom();

server.use(cors())

// Setup Swagger UI and OpenAPI 3.1 Spec Endpoint
setupApiDocs(server, {
  path: "/docs",
  title: "Subatom API Reference",
  version: "2.0.0",
  description: "Context-Based Routing & Automated OpenAPI Documentation",
});

// Handle root path request.
server.get("/", async (req: IRequest, res: IResponse) => {
  res.json("Welcome to subatom http sample.");
});

server.use(json());

// Register http router.
server.use("/api/v1/http/app", userRouter)

server.start();
