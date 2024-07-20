"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_BUFFER_SIZE = exports.DEFAULT_TIMEOUT_MS = exports.DEFAULT_MAX_MESSAGE_SIZE = void 0;
exports.randomUInt32 = randomUInt32;
exports.writableStreamFromChannel = writableStreamFromChannel;
exports.write = write;
exports.bufferedWritableStream = bufferedWritableStream;
const tslib_1 = require("tslib");
const http_1 = require("@aicacia/http");
const rand_1 = require("@aicacia/rand");
exports.DEFAULT_MAX_MESSAGE_SIZE = 16384;
exports.DEFAULT_TIMEOUT_MS = 60000;
exports.DEFAULT_BUFFER_SIZE = 4096;
function randomUInt32() {
    return (Math.random() * rand_1.MAX_INT) | 0;
}
function writableStreamFromChannel(channel, idBytes, maxChannelMessageSize) {
    return new WritableStream({
        write(chunk) {
            write(channel, (0, http_1.concatUint8Array)(idBytes, chunk), maxChannelMessageSize);
        },
    });
}
function write(channel, chunk, maxChannelMessageSize) {
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
function bufferedWritableStream(writableStream, bufferSize = exports.DEFAULT_BUFFER_SIZE) {
    const buffer = new Uint8Array(bufferSize);
    let bufferOffset = 0;
    const writer = writableStream.getWriter();
    function write(chunk) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            let bytesWritten = 0;
            while (bytesWritten < chunk.byteLength) {
                if (bufferOffset >= bufferSize) {
                    yield flush();
                }
                const length = Math.min(bufferSize - bufferOffset, chunk.byteLength - bytesWritten);
                buffer.set(chunk.slice(bytesWritten, bytesWritten + length), bufferOffset);
                bufferOffset += length;
                bytesWritten += length;
            }
        });
    }
    function flush() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (bufferOffset > 0) {
                yield writer.write(buffer.slice(0, bufferOffset));
                bufferOffset = 0;
            }
        });
    }
    return new WritableStream({
        write,
        close() {
            return tslib_1.__awaiter(this, void 0, void 0, function* () {
                yield flush();
                yield writer.close();
            });
        },
    });
}
