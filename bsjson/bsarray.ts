import { bsValueFactory, ETypeCode, textDecoder } from './bsbase';

export class BsArray {
    constructor(bufferView: DataView, offset: number) {
        this.mBufferView = bufferView;
        this.mOffset = offset;
    }

    public getCount(): number {
        return this.mBufferView.getInt32(this.mOffset, true);
    }

    public getValue(index: number) {
        const count = this.mBufferView.getInt32(this.mOffset, true);
        if (index < count) {
            return this.getValueUnsafe(index);
        }
        return undefined;
    }

    public getValueUnsafe(index: number) {
        const type = this.mBufferView.getUint8(this.mOffset + index);
        switch (type) {
        case ETypeCode.Array:
            {
                const count = this.mBufferView.getInt32(this.mOffset, true);
                const offset = this.mBufferView.getInt32(4 + count + index * 4);
                return new BsArray(this.mBufferView, offset);
            }
        case ETypeCode.ArrayRef:
            {
                const count = this.mBufferView.getInt32(this.mOffset, true);
                const offset1 = this.mBufferView.getInt32(4 + count + index * 4);
                const offset = this.mBufferView.getInt32(offset1);
                return new BsArray(this.mBufferView, offset);
            }
        case ETypeCode.Object:
            {
                const count = this.mBufferView.getInt32(this.mOffset, true);
                const offset = this.mBufferView.getInt32(4 + count + index * 4);
                return bsValueFactory.createBsObject(this.mBufferView, offset);
            }
        case ETypeCode.ObjectRef:
            {
                const count = this.mBufferView.getInt32(this.mOffset, true);
                const offset1 = this.mBufferView.getInt32(4 + count + index * 4);
                const offset = this.mBufferView.getInt32(offset1);
                return bsValueFactory.createBsObject(this.mBufferView, offset);
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

    private mBufferView: DataView;
    private mOffset: number;
}

bsValueFactory.registerArrayCreator(function (bv: DataView, ofst: number) { return new BsArray(bv, ofst); });
