import type { IRequest, IResponse } from "subatom";

async function postController(req: IRequest, res: IResponse): Promise<void> {}

async function handleGalleryController(
  req: IRequest,
  res: IResponse,
): Promise<void> {}

export { handleGalleryController, postController };
