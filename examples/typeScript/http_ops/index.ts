import { Subatom, setupApiDocs, json, IRequest, IResponse, cors } from "subatom";
import httpRouter from "./src/routers/http.route.js";

const server = new Subatom();

server.use(cors())

setupApiDocs(server, {
  title: "TypeScript Http Server (SubAtom)",
  version: "1.0.0",
});

// Handle root path request.
server.get("/", async (req: IRequest, res: IResponse) => {
  res.json("Welcome to subatom http sample.");
});

server.use(json());

// Register http router.
server.use("/api/v1/http/sample", httpRouter)

server.start();
