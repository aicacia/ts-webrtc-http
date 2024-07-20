import { concatUint8Array } from "@aicacia/http";
import { MAX_INT } from "@aicacia/rand";
export const DEFAULT_MAX_MESSAGE_SIZE = 16384;
export const DEFAULT_TIMEOUT_MS = 60_000;
export const DEFAULT_BUFFER_SIZE = 4096;
export function randomUInt32() {
    return (Math.random() * MAX_INT) | 0;
}
export function writableStreamFromChannel(channel, idBytes, maxChannelMessageSize) {
    return new WritableStream({
        write(chunk) {
            write(channel, concatUint8Array(idBytes, chunk), maxChannelMessageSize);
        },
    });
}
export function write(channel, chunk, maxChannelMessageSize) {
    if (chunk.byteLength < maxChannelMessageSize) {
        channel.send(chunk);
    }
    else {
        let offset = 0;
        while (offset < chunk.byteLength) {
            const length = Math.min(maxChannelMessageSize, chunk.byteLength - offset);
            channel.send(chunk.slice(offset, offset + length));
            offset += length;
        }
    }
}
export function bufferedWritableStream(writableStream, bufferSize = DEFAULT_BUFFER_SIZE) {
    const buffer = new Uint8Array(bufferSize);
    let bufferOffset = 0;
    const writer = writableStream.getWriter();
    async function write(chunk) {
        let bytesWritten = 0;
        while (bytesWritten < chunk.byteLength) {
            if (bufferOffset >= bufferSize) {
                await flush();
            }
            const length = Math.min(bufferSize - bufferOffset, chunk.byteLength - bytesWritten);
            buffer.set(chunk.slice(bytesWritten, bytesWritten + length), bufferOffset);
            bufferOffset += length;
            bytesWritten += length;
        }
    }
    async function flush() {
        if (bufferOffset > 0) {
            await writer.write(buffer.slice(0, bufferOffset));
            bufferOffset = 0;
        }
    }
    return new WritableStream({
        write,
        async close() {
            await flush();
            await writer.close();
        },
    });
}
