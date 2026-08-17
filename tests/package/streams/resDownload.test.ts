import { describe, it, expect, vi } from "vitest";
import type { ServerResponse } from "node:http";
import { resDownload } from "../../../package/core/http/streams/methods/file/resDownload.js";
import * as resSendFileModule from "../../../package/core/http/streams/methods/file/resSendFile.js";
describe("resDownload", () => {
    it("should set Content-Disposition header with filename and delegate to resSendFile", () => {
        const res = {
            setHeader: vi.fn(),
        } as unknown as ServerResponse;

        const sendFileSpy = vi
            .spyOn(resSendFileModule, "resSendFile")
            .mockImplementation(() => {});

        resDownload(res, "/files/report.pdf", "annual-report.pdf", { root: "/files" });

        expect(res.setHeader).toHaveBeenCalledWith(
            "Content-Disposition",
            'attachment; filename="annual-report.pdf"; filename*=UTF-8\'\'annual-report.pdf',
        );
        expect(sendFileSpy).toHaveBeenCalledWith(res, "/files/report.pdf", { root: "/files" });
    });

    it("should derive filename from path when filename parameter is omitted", () => {
        const res = {
            setHeader: vi.fn(),
        } as unknown as ServerResponse;

        const sendFileSpy = vi
            .spyOn(resSendFileModule, "resSendFile")
            .mockImplementation(() => {});

        resDownload(res, "/uploads/document.docx");

        expect(res.setHeader).toHaveBeenCalledWith(
            "Content-Disposition",
            'attachment; filename="document.docx"; filename*=UTF-8\'\'document.docx',
        );
        expect(sendFileSpy).toHaveBeenCalledWith(res, "/uploads/document.docx", {});
    });

    it("should sanitize double quotes in filename and UTF-8 encode special characters", () => {
        const res = {
            setHeader: vi.fn(),
        } as unknown as ServerResponse;

        vi.spyOn(resSendFileModule, "resSendFile").mockImplementation(() => {});

        resDownload(res, "/path/to/file", 'my "cool" résumé.pdf');

        expect(res.setHeader).toHaveBeenCalledWith(
            "Content-Disposition",
            'attachment; filename="my \\"cool\\" résumé.pdf"; filename*=UTF-8\'\'my%20%22cool%22%20r%C3%A9sum%C3%A9.pdf',
        );
    });
});