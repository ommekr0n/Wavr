// Rendering and waveform modules can resolve private media without importing the auth client.
let resolver = async uri => uri;
export function setMediaUrlResolver(resolve) { resolver = resolve; }
export function resolveMediaUrl(uri) { return resolver(uri); }
