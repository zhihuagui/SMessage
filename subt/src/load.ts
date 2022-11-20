import Zstd, { ZstdModule } from "./wasm/zstdWeb";

declare global {
    interface Window {
        zstdModule: ZstdModule;
    }
}

function encodeUtf8(s: string) {
    const utf8 = new Uint8Array(s.length * 2);
    let i = 0;
    let j = 0;

    while (i < s.length) {
        let codePoint;

        // Decode UTF-16
        const a = s.charCodeAt(i++);
        if (a < 0xd800 || a >= 0xdc00) {
            codePoint = a;
        } else {
            const b = s.charCodeAt(i++);
            codePoint = (a << 10) + b + (0x10000 - (0xd800 << 10) - 0xdc00);
        }

        // Encode UTF-8
        if (codePoint < 0x80) {
            utf8[j++] = codePoint;
        } else {
            if (codePoint < 0x800) {
                utf8[j++] = ((codePoint >> 6) & 0x1f) | 0xc0;
            } else {
                if (codePoint < 0x10000) {
                    utf8[j++] = ((codePoint >> 12) & 0x0f) | 0xe0;
                } else {
                    utf8[j++] = ((codePoint >> 18) & 0x07) | 0xf0;
                    utf8[j++] = ((codePoint >> 12) & 0x3f) | 0x80;
                }
                utf8[j++] = ((codePoint >> 6) & 0x3f) | 0x80;
            }
            utf8[j++] = (codePoint & 0x3f) | 0x80;
        }
    }

    return new Uint8Array(utf8.buffer, 0, j);
}

Zstd()
    .then((module) => {
        window.zstdModule = module;
        const txtDecoder = new TextDecoder();
        const txtEncoder = new TextEncoder();

        module.getStringValue = function (offset: number) {
            if (!offset) {
                return "";
            }
            const size = this.HEAP32[offset >> 2];
            const u8ary = new Uint8Array(this.HEAPU8.buffer, offset + 4, size);
            return txtDecoder.decode(u8ary);
        };
        module.compressString = function (str: string) {
            return this._compressInternal(this._compressBuffer, str);
        };
        module.decompressString = function (buffer: Uint8Array) {
            return this._decompressInternal(this._decompressBuffer, buffer);
        };
        module.compressUsingGzip = function (str: string) {
            return this._compressInternal(this._gzip, str);
        };
        module.decompressUsingGzip = function (buf: Uint8Array) {
            return this._decompressInternal(this._ungzip, buf);
        };

        module._compressInternal = function (
            method: (dataPtr: number, level: number) => number,
            str: string
        ) {
            const strBuf = txtEncoder.encode(str);
            // const strBuf = encodeUtf8(str);
            const intptr = this._emsAlloc(strBuf.length + 4);
            this.HEAP32[intptr >> 2] = strBuf.length;
            this.HEAPU8.set(strBuf, intptr + 4);
            const rst = method(intptr, 3);
            this._emsFree(intptr);
            const rstSize = this.HEAP32[rst >> 2];
            const rstAry = new Uint8Array(this.HEAPU8.buffer, rst + 4, rstSize);
            const ret = new Uint8Array(rstSize);
            ret.set(rstAry);
            return ret;
        };
        module._decompressInternal = function (
            method: (dataPtr: number) => number,
            buffer: Uint8Array
        ) {
            const intptr = this._emsAlloc(buffer.length + 4);
            this.HEAP32[intptr >> 2] = buffer.length;
            this.HEAPU8.set(buffer, intptr + 4);
            const rst = method(intptr);
            this._emsFree(intptr);
            const rstSize = this.HEAP32[rst >> 2];
            const rstAry = new Uint8Array(this.HEAPU8.buffer, rst + 4, rstSize);
            return txtDecoder.decode(rstAry);
        };

        const binBuffer = fetch("./dist/piano.bin");
        return binBuffer.then((rsp) => {
            return rsp.arrayBuffer();
        });
    })
    .then((binBuffer) => {
        const zstdLib = window.zstdModule;
        const pointer = zstdLib._emsAlloc(binBuffer.byteLength);
        zstdLib.HEAPU8.set(new Uint8Array(binBuffer), pointer);
        const out = zstdLib._setPackageCompressFile(1001, pointer);
        console.log(out);

        const gaStr = zstdLib.getStringValue(
            zstdLib._getGroupTypeAllByPackage(1001)
        );
        const gzAll = zstdLib.compressUsingGzip(gaStr);
        const zstdAll = zstdLib.compressString(gaStr);
        const gzdAll = zstdLib.decompressUsingGzip(gzAll);
        const zstdDall = zstdLib.decompressString(zstdAll);

        (window as any).pobjs = {
            gall: JSON.parse(gaStr),
            fn100: JSON.parse(
                zstdLib.getStringValue(zstdLib._getFormulaById(1001, -100))
            ),
            fn1000001: JSON.parse(
                zstdLib.getStringValue(zstdLib._getFormulaById(1001, 1000001))
            ),
            zstdAll,
            gzAll,
            zstdDall,
            gzdAll,
        };

        return fetch("./test.json").then(async (rsp) => {
            (window as any).gjson = await rsp.text();
        });
    })
    .then(() => {
        const zstdLib = window.zstdModule;
        const gaStr = (window as any).gjson;
        const gzAll = zstdLib.compressUsingGzip(gaStr);
        const zstdAll = zstdLib.compressString(gaStr);
        const gzdAll = zstdLib.decompressUsingGzip(gzAll);
        const zstdDall = zstdLib.decompressString(zstdAll);

        (window as any).pobjs2 = {
            zstdAll,
            gzAll,
            zstdDall,
            gzdAll,
        };
    });
