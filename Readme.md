# Subatom

Modern backend framework for Node.js. 

## Installation

npm install subatom

## Example

```ts
import { Subatom } from "subatom";

const server = new Subatom();

app.get("/", (req, res) => {
  res.send("Hello World");
});

app.listen(8080);

## NOTE: Currently in development phase.