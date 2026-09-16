# Subatom

Modern backend framework for Node.js.

## Installation

```bash
npm install subatom
```
Or

```bash
npm create subatom@latest .
```


## Example

---
```- TypeScript```
---

```ts
import {
  Subatom,
  SubAtomDocs,
  type IRequest,
  type IResponse,
  type ISubatom,
} from "subatom";

const server: ISubatom = new Subatom();

server.setConfig({
  port: 8080,
  host: "localhost",
  maxConcurrentRequests: 1000,
  entry: "main.ts"
});

// Register base route
server.get("/", (_req: IRequest, res: IResponse) => {
  res.send("Hello from Subatom!");
});

// API Documentation at /docs
SubAtomDocs(server, {
  path: "/docs",
  title: "Subatom Pulse API",
  version: "1.0.0",
});

server.start();
```


---
```- JavaScript```
---

```js
import { Subatom, SubAtomDocs } from "subatom";

const server = new Subatom();

// 1. Set configurations.
server.setConfig({
  port: 8080,
  host: "localhost",
  maxConcurrentRequests: 1000,
  entry: "main.js"
});

// 2. Register base route
server.get("/", (req, res) => {
  res.send("Hello from Subatom!");
});

// 3. API Documentation at /docs
SubAtomDocs(server, {
  path: "/docs",
  title: "Subatom Pulse API",
  version: "1.0.0",
});

// 4. Start server.
server.start();
```




## Official Docs: ```https://subatomjs.dev```

## NOTE: Currently in development phase.