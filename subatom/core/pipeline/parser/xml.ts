import type { NextFunction } from "../../../types/framework/pipeline/INext.js";
import type { ILimit } from "../../../types/framework/pipeline/IPipeline.js";
import type { IRequest } from "../../../types/http/IRequest.js";
import type { IResponse } from "../../../types/http/IResponse.js";
import { parseLimit } from "../../utils/parseLimit.js";

/**
 * Lightweight, native XML to JS Object parser (Zero Dependencies)
 */
function parseNativeXml(xmlString: string): Record<string, any> {
  const cleanXml: any = xmlString
    .replace(/<!--[\s\S]*?-->/g, "") // Remove comments
    .replace(/<\?xml[\s\S]*?\?>/g, "") // Remove XML declaration
    .trim();

  if (!cleanXml) return {};

  let index = 0;

  function parseNode(): any {
    skipWhitespace();

    if (index >= cleanXml.length) return null;

    // CDATA Section
    if (cleanXml.startsWith("<![CDATA[", index)) {
      const start = index + 9;
      const end = cleanXml.indexOf("]]>", start);
      if (end === -1) throw new Error("Unclosed CDATA section");
      const cdataText = cleanXml.slice(start, end);
      index = end + 3;
      return cdataText;
    }

    // Opening Tag
    if (cleanXml[index] !== "<") {
      // Text Content
      const start = index;
      while (index < cleanXml.length && cleanXml[index] !== "<") {
        index++;
      }
      return decodeXmlEntities(cleanXml.slice(start, index).trim());
    }

    index++; // Skip '<'
    const tagMatch = cleanXml.slice(index).match(/^([^\s/>]+)/);
    if (!tagMatch) throw new Error("Invalid tag name");

    const tagName = tagMatch[1];
    if (!tagName) throw new Error("Invalid tag name");
    index += tagName.length;

    const attributes: Record<string, any> = {};

    // Parse Tag Attributes
    while (
      index < cleanXml.length &&
      cleanXml[index] !== ">" &&
      cleanXml[index] !== "/"
    ) {
      skipWhitespace();
      if (cleanXml[index] === ">" || cleanXml[index] === "/") break;

      const attrMatch = cleanXml
        .slice(index)
        .match(/^([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/);
      if (attrMatch) {
        const [, attrName, val1, val2] = attrMatch;
        attributes[`@_${attrName}`] = decodeXmlEntities(val1 ?? val2 ?? "");
        index += attrMatch[0].length;
      } else {
        index++;
      }
    }

    // Self-Closing Tag: <tag />
    if (cleanXml[index] === "/") {
      index += 2; // Skip '/>'
      return Object.keys(attributes).length > 0 ? attributes : "";
    }

    index++; // Skip '>'

    // Parse Children and Text
    const children: Record<string, any> = { ...attributes };
    let textContent = "";

    while (index < cleanXml.length) {
      skipWhitespace();

      // Closing Tag Check
      if (cleanXml.startsWith(`</${tagName}>`, index)) {
        index += tagName.length + 3; // Skip '</tag>'
        break;
      }

      if (cleanXml[index] === "<") {
        if (cleanXml[index + 1] === "/") {
          throw new Error(`Mismatched closing tag near index ${index}`);
        }

        const childNode = parseNode();
        if (childNode !== null) {
          const childTag = Object.keys(childNode)[0];
          if (!childTag) throw new Error("child node is missing..");

          const childValue = childNode[childTag];

          if (children[childTag] !== undefined) {
            if (!Array.isArray(children[childTag])) {
              children[childTag] = [children[childTag]];
            }
            children[childTag].push(childValue);
          } else {
            children[childTag] = childValue;
          }
        }
      } else {
        const text = parseNode();
        if (typeof text === "string") textContent += text;
      }
    }

    const keys = Object.keys(children);
    if (keys.length === 0) return { [tagName]: textContent };
    if (textContent.trim()) children["#text"] = textContent;

    return { [tagName]: children };
  }

  function skipWhitespace() {
    while (index < cleanXml.length && /\s/.test(cleanXml[index])) {
      index++;
    }
  }

  function decodeXmlEntities(str: string): string {
    return str
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }

  const result = parseNode();
  return result ?? {};
}

export function xml(options: ILimit = {}) {
  const maxBytes = parseLimit(options.limit ?? "100kb");

  return async (req: IRequest, res: IResponse, next: NextFunction) => {
    const contentType = req.raw.headers["content-type"] || "";
    const hasBody =
      req.raw.headers["content-length"] || req.raw.headers["transfer-encoding"];

    const isXml =
      contentType.includes("application/xml") ||
      contentType.includes("text/xml") ||
      contentType.includes("+xml");

    if (!hasBody || !isXml) {
      req.body = req.body ?? {};
      return next();
    }

    const contentLength = parseInt(
      req.raw.headers["content-length"] || "0",
      10,
    );
    if (contentLength > maxBytes) {
      res.status(413).json({
        success: false,
        message: "Payload Too Large",
      });
      return;
    }

    try {
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      for await (const chunk of req.raw) {
        totalBytes += chunk.length;

        if (totalBytes > maxBytes) {
          res.status(413).json({
            success: false,
            message: "Payload Too Large",
          });
          return;
        }

        chunks.push(chunk);
      }

      const rawBody = Buffer.concat(chunks).toString("utf-8");

      if (rawBody.trim().length > 0) {
        req.body = parseNativeXml(rawBody);
      } else {
        req.body = {};
      }

      await next();
    } catch (error) {
      res.status(400).json({
        success: false,
        message: "Bad Request: Invalid XML Payload",
      });
    }
  };
}
