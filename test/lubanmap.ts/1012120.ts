
class BasePPBuffer {
    static txtEncoder = new TextEncoder();
    static txtDecoder = new TextDecoder('utf8');
    constructor(bytelen: number) {
        this._buffer = new ArrayBuffer(bytelen);
        this._bufferView = new DataView(this._buffer);
        this._nextOffset = 0;
    }

    public createString(str: string) {
        const rst = BasePPBuffer.txtEncoder.encodeInto(str, new Uint8Array(this._buffer, this._nextOffset));
        if (rst.written) {
            this._nextOffset += rst.written;
        }
    }

    protected _nextOffset: number;
    protected _buffer: ArrayBuffer;
    protected _bufferView: DataView;
}

class PropertyMap1012120 extends BasePPBuffer {
    public get FIELD2() {
        const ofst = this._bufferView.getUint32(0);
        const len = this._bufferView.getUint32(4);
        if (len === 0) {
            return ''
        }
        return BasePPBuffer.txtDecoder.decode(new Uint8Array(this._buffer, ofst, len));
    }

    public get FIELD2_tag() {
        return this._bufferView.getUint32(8, true);
    }

    public setFIELD2_tag(tag: number) {
        this._bufferView.setUint32(8, tag, true);
    }

    public get FIELD2_actualType() {
        return 'stringValue';
    }

    public get FIELD2_editMode() {
        return 1;
    }

}