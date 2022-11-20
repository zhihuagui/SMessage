
export interface ZstdModule {
    _emsAlloc(size: number): number;
    _emsFree(ptr: number): void;

    _setPackageCompressFile: (packageId: number, dataPtr: number) => number;
    _getFormulaById: (packageId: number, id: number) => number;

    _getGroupTypeAllByPackage: (packageId: number) => number;

    _compressBuffer: (dataPtr: number, level: number) => number;
    _decompressBuffer: (dataPtr: number) => number;
    _gzip: (dataPtr: number, level: number) => number;
    _ungzip: (dataPtr: number) => number;

    getStringValue: (offset: number) => string;
    compressString: (str: string) => Uint8Array;
    decompressString: (buf: Uint8Array) => string;
    compressUsingGzip: (str: string) => Uint8Array;
    decompressUsingGzip: (buf: Uint8Array) => string;

    _compressInternal: (method: (dataPtr: number, level: number) => number, str: string) => Uint8Array;
    _decompressInternal: (method: (dataPtr: number) => number, buffer: Uint8Array) => string;

    HEAPU8: Uint8Array;
    HEAP32: Uint32Array;
}


export default function WASMFunction() : Promise<ZstdModule>;
