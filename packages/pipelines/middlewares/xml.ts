/**
 * @fileoverview This module is responsible for providing a zero-dependency
 *  XML body-parser middleware and a native XML-to-JavaScript object parser for subatom framework.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type {
	ILimit,
	XmlAttributes,
	XmlNode,
	XmlValue,
} from "./types/middleware.types.js";
import type { NextFunction } from "../next/types/nextFunction.types.js";
import type { IRequest } from "../../core/http/request/types/request.types.js";
import type { IResponse } from "../../core/http/response/types/response.types.js";
import { parseLimit } from "./utils/limit/parseLimit.js";

/**
 * Lightweight, native XML to JS Object parser (Zero Dependencies)
 */
function parseNativeXml(xmlString: string): XmlNode {
	const cleanXml: string = xmlString
		.replace(/<!--[\s\S]*?-->/g, "") // Remove comments
		.replace(/<\?xml[\s\S]*?\?>/g, "") // Remove XML declaration
		.trim();

	if (!cleanXml) return {};

	let index = 0;

	function parseNode(): XmlValue | null {
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

		const attributes: XmlAttributes = {};

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
		const children: XmlNode = { ...attributes };
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
				if (
					childNode !== null &&
					typeof childNode === "object" &&
					!Array.isArray(childNode)
				) {
					const childTag = Object.keys(childNode)[0];
					if (!childTag) throw new Error("child node is missing..");

					const childValue = childNode[childTag];
					if (childValue !== undefined) {
						const existingChild = children[childTag];
						if (existingChild !== undefined) {
							if (Array.isArray(existingChild)) {
								existingChild.push(childValue);
							} else {
								children[childTag] = [existingChild, childValue];
							}
						} else {
							children[childTag] = childValue;
						}
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

	function skipWhitespace(): void {
		while (index < cleanXml.length && /\s/.test(cleanXml[index] ?? "")) {
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
	if (result !== null && typeof result === "object" && !Array.isArray(result)) {
		return result;
	}

	return {};
}

export function xml(options: ILimit = {}) {
	const maxBytes = parseLimit(options.limit ?? "100kb");

	return async (
		req: IRequest,
		res: IResponse,
		next: NextFunction,
	): Promise<void> => {
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
				const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
				totalBytes += bufferChunk.length;

				if (totalBytes > maxBytes) {
					res.status(413).json({
						success: false,
						message: "Payload Too Large",
					});
					return;
				}

				chunks.push(bufferChunk);
			}

			const rawBody = Buffer.concat(chunks).toString("utf-8");

			if (rawBody.trim().length > 0) {
				req.body = parseNativeXml(rawBody);
			} else {
				req.body = {};
			}

			await next();
		} catch (_error: unknown) {
			res.status(400).json({
				success: false,
				message: "Bad Request: Invalid XML Payload",
			});
		}
	};
}
