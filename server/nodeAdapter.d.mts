import type { IncomingMessage, ServerResponse } from 'node:http';

export function toWebRequest(req: IncomingMessage, origin: string): Request;
export function sendWebResponse(res: ServerResponse, response: Response): Promise<void>;
