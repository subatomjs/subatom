export interface PermissionsPolicyDirectives {
	accelerometer?: string[];
	camera?: string[];
	geolocation?: string[];
	gyroscope?: string[];
	magnetometer?: string[];
	microphone?: string[];
	payment?: string[];
	usb?: string[];
	fullscreen?: string[];
	[key: string]: string[] | undefined;
}

export interface PermissionsPolicyConfig {
	features?: PermissionsPolicyDirectives;
}

export const defaultPermissionsPolicyConfig: PermissionsPolicyConfig = {
	features: {
		accelerometer: [],
		camera: [],
		geolocation: [],
		gyroscope: [],
		magnetometer: [],
		microphone: [],
		payment: [],
		usb: [],
	},
};
