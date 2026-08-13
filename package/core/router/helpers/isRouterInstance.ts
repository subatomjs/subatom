import { IRouter } from "../../../types/framework/router/IRouter.js";
import { Router } from "../Router.js";

function isRouterInstance(x: unknown): x is Router {
  return (
    !!x &&
    typeof (x as IRouter).getRoutes === "function" &&
    typeof (x as Router).dispatch === "function"
  );
}
export default isRouterInstance;
