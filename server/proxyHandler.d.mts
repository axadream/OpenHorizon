/** Type declarations for proxyHandler.mjs (the module is plain JS with JSDoc). */
export function isPrivateHost(hostname: string): boolean;
export function handleProxy(request: Request): Promise<Response>;
