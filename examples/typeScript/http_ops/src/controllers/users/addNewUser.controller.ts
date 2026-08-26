import { IRequest, IResponse } from "subatom";

async function addNewUserCtrl(req: IRequest, res: IResponse): Promise<void> {
  const {
    userName,
    emailId,
    fullName,
    age,
  }: { userName: string; emailId: string; fullName: string; age: string } =
    req.body;
  const files = req.file;

  console.log(files)

  const returnObj = {
    userName,
    emailId,
    fullName,
    age,
    file: files,
  };

  return <any>res.json(returnObj);
}

export default addNewUserCtrl;
