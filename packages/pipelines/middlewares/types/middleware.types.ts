export interface ILimit {
	limit?: string | number;
}

export interface IRawOptions {
	limit?: string | number;
	type?: string | string[];
}

export interface IStaticOptions {
	index?: string;
	dotfiles?: "allow" | "ignore" | "deny";
	autoCreateDir?: boolean;
}

export interface ITextOptions {
	limit?: string | number;
	type?: string | string[];
	defaultEncoding?: BufferEncoding;
}

export type XmlPrimitive = string;
export type XmlValue = XmlPrimitive | XmlNode | XmlValue[];

export interface XmlNode {
	[key: string]: XmlValue;
}

export type XmlAttributes = Record<string, string>;
