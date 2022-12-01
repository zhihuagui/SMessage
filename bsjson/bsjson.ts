import { BsBuffer, BsViewUtil, ETypeCode, JsonArray, JsonObject, textDecoder, textEncoder } from './bsbase';

const dictAddr = 4;

export class BsMapDict {
    constructor(dv: DataView, ofst: number) {
        this.mBufferView = dv;
        this.mOffset = ofst;
    }
    
    public putDict(dict: string[]) {
        for (let i = 0; i < dict.length; i++) {
            textEncoder.encodeInto(dict[i], new Uint8Array(this.mBufferView.buffer, this.mOffset));
        }
    }

    public getOffset() {
        return this.mOffset;
    }

    private mBufferView: DataView;
    private mOffset = 0;
}

export class BsJSON {
    constructor(size?: number) {
        const buffer = new ArrayBuffer(size || 1024 * 1024);
        this.mBufferView = new DataView(buffer);
        this.mMainOffset = 0;

        this.mStringMapping = new Map();
    }

    public getMapDict() {
        let addr = this.mBufferView.getInt32(dictAddr, true);
        const count = this.mBufferView.getUint16(dictAddr + 4, true);
        const retDict: string[] = [];
        retDict.length = count;
        for (let i = 0; i < count; i++) {
            const end = BsViewUtil.getStringBytes(this.mBufferView, addr);
            const str = textDecoder.decode(new Uint8Array(this.mBufferView.buffer, addr, end - addr));
            retDict[i] = str;
            addr = end + 1;
        }
        return retDict;
    }

    private mStringMapping: Map<string, number>;
    private mBufferView: DataView;
    private mMainOffset: number;
}

export class BsJSONBuilder {
    constructor(initialSize: number) {
        this.mBsBuffer = new BsBuffer(initialSize);
    }

    public buildGlobalObject(obj: JsonObject) {
        this.mBsBuffer.mCurrentOffset = 8;
        this.buildObject(obj);
        this.appendDict();
    }

    public buildObject(obj: JsonObject) {
        const objAddr = this.mBsBuffer.mCurrentOffset;
        const keys = Object.keys(obj);
        const keyAddr = objAddr + 4 * keys.length;
        const typeAddr = objAddr + 6 * keys.length;
        this.mBsBuffer.mCurrentOffset += 7 * keys.length;
        for (let i = 0; i < keys.length; i++) {
            const ikey = this.getKeyIndex(keys[i]);
            this.mBsBuffer.setUint16(keyAddr + i >> 1, ikey);
            const value = obj[keys[i]];
            switch (typeof value) {
                case 'string': {
                    const addr = this.mBsBuffer.appendString(value);
                    this.mBsBuffer.setInt32(objAddr + 4 * i, addr);
                    this.mBsBuffer.setUint8(typeAddr + i, ETypeCode.String);
                    break;
                }
                case 'boolean': {
                    this.mBsBuffer.setUint8(typeAddr + i, value ? ETypeCode.True : ETypeCode.False);
                    break;
                }
                case 'number': {
                    if (Number.isInteger(value)) {
                        this.mBsBuffer.setInt32(objAddr + 4 * i, value);
                        this.mBsBuffer.setUint8(typeAddr + i, ETypeCode.Int32);
                    } else {
                        const addr = this.mBsBuffer.appendNumber(value);
                        this.mBsBuffer.setInt32(objAddr + 4 * i, addr);
                        this.mBsBuffer.setUint8(typeAddr + i, ETypeCode.Float64);
                    }
                    break;
                }
                case 'object': {
                    if (value === null) {
                        this.mBsBuffer.setUint8(typeAddr + i, ETypeCode.Null);
                    } else if (value instanceof Array) {
                        const addr = this.buildArray(value);
                        this.mBsBuffer.setInt32(objAddr + 4 * i, addr);
                        this.mBsBuffer.setUint8(typeAddr + i, ETypeCode.Array);
                    } else if (value instanceof Object) {
                        const addr = this.buildObject(value);
                        this.mBsBuffer.setInt32(objAddr + 4 * i, addr);
                        this.mBsBuffer.setUint8(typeAddr + i, ETypeCode.Object);
                    }
                    break;
                }
            }
        }
        return objAddr;
    }

    public buildArray(ary: JsonArray) {
        const objAddr = this.mBsBuffer.mCurrentOffset;
        const typeAddr = objAddr + ary.length >> 2;
        this.mBsBuffer.mCurrentOffset += 6 * ary.length;
        for (let i = 0; i < ary.length; i++) {
            const value = ary[i];
            switch (typeof value) {
                case 'string': {
                    const addr = this.mBsBuffer.appendString(value);
                    this.mBsBuffer.setInt32(objAddr + 4 * i, addr);
                    this.mBsBuffer.setUint8(typeAddr + i, ETypeCode.String);
                    break;
                }
                case 'boolean': {
                    this.mBsBuffer.setUint8(typeAddr + i, value ? ETypeCode.True : ETypeCode.False);
                    break;
                }
                case 'number': {
                    if (Number.isInteger(value)) {
                        this.mBsBuffer.setInt32(objAddr + 4 * i, value);
                        this.mBsBuffer.setUint8(typeAddr + i, ETypeCode.Int32);
                    } else {
                        const addr = this.mBsBuffer.appendNumber(value);
                        this.mBsBuffer.setInt32(objAddr + 4 * i, addr);
                        this.mBsBuffer.setUint8(typeAddr + i, ETypeCode.Float64);
                    }
                    break;
                }
                case 'object': {
                    if (value === null) {
                        this.mBsBuffer.setUint8(typeAddr + i, ETypeCode.Null);
                    } else if (value instanceof Array) {
                        const addr = this.buildArray(value);
                        this.mBsBuffer.setInt32(objAddr + 4 * i, addr);
                        this.mBsBuffer.setUint8(typeAddr + i, ETypeCode.Array);
                    } else if (value instanceof Object) {
                        const addr = this.buildObject(value);
                        this.mBsBuffer.setInt32(objAddr + 4 * i, addr);
                        this.mBsBuffer.setUint8(typeAddr + i, ETypeCode.Object);
                    }
                    break;
                }
            }
        }
        return 0;
    }

    public getKeyIndex(key: string) {
        const ret = this.mDictStr2Int[key];
        if (!ret) {
            this.mMapDict.push(key);
            this.mDictStr2Int[key] = this.mMapDict.length;
            return this.mMapDict.length;
        }
        return ret;
    }

    public appendDict() {
        const addr = this.mBsBuffer.appendStringList(this.mMapDict);
        this.mBsBuffer.setInt32(dictAddr, addr);
        this.mBsBuffer.setUint16(dictAddr + 4, this.mMapDict.length);
    }

    private mDictStr2Int: { [key: string]: number } = {};
    private mMapDict: string[] = [];
    private mBsBuffer: BsBuffer;
}

function getAllArrayS(obj, sset) {
    for (let i = 0; i < obj.length; i++) {
        const sobj = obj[i];
        if (typeof sobj === 'object') {
            if (sobj === null) {
                continue;
            } else if (sobj instanceof Array) {
                getAllArrayS(sobj, sset);
            } else {
                getAllString(sobj, sset);
            }
        } else if (typeof sobj === 'string') {
            sset.add(sobj);
        }
    }
}

function getAllString(obj, sset) {
    for (const key in obj) {
        sset.add(key);
        const sobj = obj[key];
        if (typeof sobj === 'object') {
            if (sobj === null) {
                continue;
            } else if (sobj instanceof Array) {
                getAllArrayS(sobj, sset);
            } else {
                getAllString(sobj, sset);
            }
        } else if (typeof sobj === 'string') {
            sset.add(sobj);
        }
    }
}
