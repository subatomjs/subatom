import pc from "picocolors";

const timestamp = () => pc.dim(new Date().toLocaleTimeString());

export const logger = {
  info: (msg: string) => console.log(`${timestamp()} ${pc.cyan("[subatom]")} ${msg}`),
  success: (msg: string) => console.log(`${timestamp()} ${pc.green("[subatom]")} ${msg}`),
  warn: (msg: string) => console.log(`${timestamp()} ${pc.yellow("[subatom]")} ${msg}`),
  error: (msg: string) => console.error(`${timestamp()} ${pc.red("[subatom]")} ${msg}`),
};