# Subatom

Modern backend framework for Node.js. 

## Installation

npm install subatom

## Example

```ts
import { App } from "subatom";

const app = new App();

app.get("/", (req, res) => {
  res.send("Hello World");
});

app.listen(3000);

## NOTE: Currently in development phase.