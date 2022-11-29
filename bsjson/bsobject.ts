import { bsValueFactory, ETypeCode, textDecoder } from './bsbase';

export class BsObject {
    constructor(bufferView: DataView, offset: number) {
        this.mBufferView = bufferView;
        this.mOffset = offset;
    }

    public getCount(): number {
        return this.mBufferView.getInt32(this.mOffset, true);
    }

    public getIndexValueUnsafe(index: number) {
        const addrOffset = this.mBufferView.getInt32(this.mOffset + 4 + index * 4, true);
        const type = this.mBufferView.getUint8(addrOffset + 3);
        switch (type) {
            case ETypeCode.Array:
                {
                    const count = this.mBufferView.getInt32(this.mOffset, true);
                    const offset = this.mBufferView.getInt32(4 + count + index * 4);
                    return bsValueFactory.createBsArray(this.mBufferView, offset);
                }
            case ETypeCode.ArrayRef:
                {
                    const count = this.mBufferView.getInt32(this.mOffset, true);
                    const offset1 = this.mBufferView.getInt32(4 + count + index * 4);
                    const offset = this.mBufferView.getInt32(offset1);
                    return bsValueFactory.createBsArray(this.mBufferView, offset);
                }
            case ETypeCode.Object:
                {
                    const count = this.mBufferView.getInt32(this.mOffset, true);
                    const offset = this.mBufferView.getInt32(4 + count + index * 4);
                    return new BsObject(this.mBufferView, offset);
                }
            case ETypeCode.ObjectRef:
                {
                    const count = this.mBufferView.getInt32(this.mOffset, true);
                    const offset1 = this.mBufferView.getInt32(4 + count + index * 4);
                    const offset = this.mBufferView.getInt32(offset1);
                    return new BsObject(this.mBufferView, offset);
                }
            case ETypeCode.String:
                {
                    const count = this.mBufferView.getInt32(this.mOffset, true);
                    const offset = this.mBufferView.getInt32(4 + count + index * 4);
                    let len = 0;
                    while(this.mBufferView.getUint8(offset + len)) {
                        len++;
                    }
                    if (len === 0) {
                        return '';
                    }
                    return textDecoder.decode(new Uint8Array(this.mBufferView.buffer, offset, len));
                }
            case ETypeCode.StringRef:
                {
                    const count = this.mBufferView.getInt32(this.mOffset, true);
                    const offset1 = this.mBufferView.getInt32(4 + count + index * 4);
                    const offset = this.mBufferView.getInt32(offset1);
                    let len = 0;
                    while(this.mBufferView.getUint8(offset + len)) {
                        len++;
                    }
                    if (len === 0) {
                        return '';
                    }
                    return textDecoder.decode(new Uint8Array(this.mBufferView.buffer, offset, len));
                }
            case ETypeCode.Float64:
                {
                    const count = this.mBufferView.getInt32(this.mOffset, true);
                    const offset = this.mBufferView.getInt32(4 + count + index * 4);
                    return this.mBufferView.getFloat64(offset);
                }
            case ETypeCode.Int32:
                {
                    const count = this.mBufferView.getInt32(this.mOffset, true);
                    return this.mBufferView.getInt32(4 + count + index * 4);
                }
            case ETypeCode.True:
                return true;
            case ETypeCode.False:
                return false;
            case ETypeCode.Null:
                return null;
            }
    }

    public getValue(key: string) {
        const index = this.binSearchIndex(key);
        if (index < 0) return undefined;
        return this.getIndexValueUnsafe(index);
    }

    /**
     * Not found: returns: -1  
     * else returns: index
     * @param key The Key to search
     */
    private binSearchIndex(key: string) {
        const totalCount = this.getCount();

        let currIdx = Math.floor(totalCount / 2);
        let startIdx = -1;
        let endIdx = totalCount;

        do {
            const cpRst = this.compareKey(key, this.mOffset + 4 + 4 * currIdx);
            if (cpRst === 0) {
                return currIdx;
            }
            else if (cpRst > 0) {
                const step = Math.floor((endIdx - currIdx) / 2);
                if (!step) return -1;
                startIdx = currIdx;
                currIdx = currIdx + step;
            }
            else {
                const step = Math.floor((currIdx - startIdx) / 2);
                if (!step) return -1;
                endIdx = currIdx;
                currIdx = step + startIdx;
            }
        } while (true);
    }

    private compareKey(key: string, strOffset: number) {
        for (let i = 0; i < key.length; i++) {
            const byte = this.mBufferView.getUint8(strOffset + i);
            if (byte === 0) {
                return 1;
            }
        }
        if (this.mBufferView.getUint8(strOffset + key.length) === 0) {
            return 0;
        }
        return -1;
    }

    private mBufferView: DataView;
    private mOffset: number;
}
