import { BsBuffer, textEncoder } from './bsbase';

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

    }

    private mStringMapping: Map<string, number>;
    private mBufferView: DataView;
    private mMainOffset: number;
}

export class BsJSONBuilder {
    constructor(initialSize: number) {
        this.mBsBuffer = new BsBuffer(initialSize);
    }

    public startBuildObject(obj: {[key: string]: unknown}) {
        const keys = Object.keys(obj);
        for (let i = 0; i < keys.length; i++) {
            const ikey = this.getKeyIndex(keys[i]);
            const value = obj[keys[i]];
            switch (typeof keys[i]) {
                case 'boolean':
                    
            }
        }
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
    }

    private mDictStr2Int: { [key: string]: number } = {};
    private mMapDict: string[] = [];
    private mBsBuffer: BsBuffer;
}

function traverseObject(obj: any, bsb: BsJSONBuilder) {
    if (obj instanceof Array) {
        for (let i = 0; i < obj.length; i++) {
            if (typeof obj[i] === 'object') {
                traverseObject(obj, bsb);
            }
        }
        return;
    }
    const ks = Object.keys(obj);
    for (let i = 0; i < ks.length; i++) {
        const k = bsb.getKeyIndex(ks[i]);
        const sobj = obj[ks[i]];
        if (typeof sobj === 'object') {
            traverseObject(sobj, bsb);
        }
    }
}
