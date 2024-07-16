export declare class HTTPRequest extends Request {
    constructor(input: RequestInfo | URL, init?: RequestInit);
}
export declare function parseHTTPRequest(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<Request>;
export declare function parseHTTPResponse(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<Response>;
export declare function writeHTTPRequestOrResponse(writableStream: WritableStream<Uint8Array>, requestOrResponse: Request | Response): Promise<void>;
