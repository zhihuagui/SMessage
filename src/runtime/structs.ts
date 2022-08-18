
function copyArrayBuffer(src: ArrayBuffer, soffset: number, target: ArrayBuffer, toffset: number, length: number) {
    const srcDV = new DataView(src);
    const tgtDV = new DataView(target);
    for (let i = 0; i < length; i++) {
        tgtDV.setUint8(i + toffset, srcDV.getUint8(i + soffset));
    }
}

const trashToGCRatio = 0.5;

export class StructBuffer {
    constructor(buf: ArrayBuffer) {
        this._buffer = buf;
        this._dataView = new DataView(buf);
    }

    public reset(buf: ArrayBuffer) {
        this._buffer = buf;
        this._dataView = new DataView(buf);
    }

    public setRootStruct(root: StructBase) {
        this._root = root;
    }

    public _root?: StructBase;
    public _dataView: DataView;
    public _buffer: ArrayBuffer;
}

export abstract class StructBase {
    constructor(buf: ArrayBuffer | StructBuffer, offset: number) {
        if (buf instanceof StructBuffer) {
            this._sBuffer = buf;
        } else {
            this._sBuffer = new StructBuffer(buf);
        }
        this._offset = offset;
    }

    public reset(buf: ArrayBuffer | StructBuffer, offset: number) {
        if (buf instanceof StructBuffer) {
            this._sBuffer = buf;
        } else {
            this._sBuffer = new StructBuffer(buf);
        }
        this._offset = offset;
    }

    /**
     * Root的类型，一个ArrayBuffer只有一个Root
     *
     * @readonly
     * @memberof StructBase
     */
    public get mainTypeId() {
        return this._dataView.getInt32(0, true);
    }

    public set mainTypeId(typeId: number) {
        this._dataView.setInt32(0, typeId, true);
    }

    /**
     * 垃圾空间，可以被gc干掉
     *
     * @readonly
     * @memberof StructBase
     */
    public get trashLength() {
        return this._dataView.getInt32(4, true);
    }

    public set trashLength(len: number) {
        this._dataView.setInt32(4, len, true);
    }

    /**
     * 下一个可用空间的Offset
     *
     * @readonly
     * @memberof StructBase
     */
    public get nextAvailableOffset() {
        return this._dataView.getInt32(8, true);
    }

    public set nextAvailableOffset(nxtOffset: number) {
        this._dataView.setInt32(8, nxtOffset, true);
    }

    public abstract get typeId(): number;

    public abstract get byteLength(): number;

    public abstract gcStruct(): void;

    protected get _dataView() {
        return this._sBuffer._dataView;
    }
    protected get _buffer() {
        return this._sBuffer._buffer;
    }

    protected updateCapacity(minAddCapacity: number) {
        if (this._offset !== 12) {
            throw new Error('Cannot update capacity in a non-root struct.');
        }

        if (this.trashLength / this.nextAvailableOffset > trashToGCRatio) {
            throw new Error('GC shold be impled.');
        } else {
            const nxtSize = Math.max(this._buffer.byteLength * 2, this._buffer.byteLength + Math.floor(this._buffer.byteLength * 0.5) + minAddCapacity);
            const newBuffer = new ArrayBuffer(nxtSize);
            copyArrayBuffer(this._buffer, 0, newBuffer, 0, this.nextAvailableOffset);
            this._sBuffer.reset(newBuffer);
        }
    }

    protected extendSubBuffer(offset: number, originLength: number, toLength: number) {
        if (originLength >= toLength) {
            return offset;
        }
        let nxtavail = this.nextAvailableOffset;
        if (offset + originLength === nxtavail) {
            nxtavail += toLength - originLength;
            if (nxtavail > this._sBuffer._buffer.byteLength) {
                this.updateCapacity(nxtavail - this._sBuffer._buffer.byteLength);
                this.nextAvailableOffset = nxtavail;
            }
            return offset;
        } else {
            const ret = nxtavail;
            nxtavail += toLength;
            if (nxtavail > this._sBuffer._buffer.byteLength) {
                this.updateCapacity(nxtavail - this._sBuffer._buffer.byteLength);
                this.nextAvailableOffset = nxtavail;
            }
            return ret;
        }
    }

    protected createSubBuffer(byteLength: number) {
        const curOffset = this.nextAvailableOffset;
        const nxtavail = curOffset + byteLength;
        if (nxtavail > this._sBuffer._buffer.byteLength) {
            this.updateCapacity(nxtavail - this._sBuffer._buffer.byteLength);
            this.nextAvailableOffset = nxtavail;
        }
        return curOffset;
    }

    protected _sBuffer: StructBuffer;
    protected _offset: number;
}

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8');

export class StructString extends StructBase {
    public get length() {
        if (this._dataView.getInt32(this._offset, true) > 0) {
            return this._dataView.getInt32(this._offset + 4, true);
        }
        return this._dataView.getInt8(this._offset) & 0x7F;
    }

    public getString() {
        const dataOffset = this._dataView.getInt32(this._offset, true);
        if (dataOffset > 0) {
            const len = this._dataView.getInt32(this._offset + 4, true);
            const u8ary = new Uint8Array(this._buffer, dataOffset, len);
            return utf8Decoder.decode(u8ary);
        } else {
            const len = this._dataView.getInt8(this._offset) & 0x7F;
            const u8ary = new Uint8Array(this._buffer, this._offset + 1, len);
            return utf8Decoder.decode(u8ary);
        }
    }

    public setString(str: string) {
        const buffer = utf8Encoder.encode(str);
        const dataOffset = this._dataView.getInt32(this._offset, true);
        if (buffer.length < 12) {
            if (dataOffset < 0) {
                this._dataView.setInt8(this._offset, buffer.length | 0x80);
                copyArrayBuffer(buffer, 0, this._buffer, this._offset + 1, buffer.length);
            } else {
                this._dataView.setInt32(this._offset + 4, buffer.length, true);
                copyArrayBuffer(buffer, 0, this._buffer, dataOffset, buffer.length);
            }
        } else {
            if (dataOffset < 0) {
                const ndoffset = this.createSubBuffer(buffer.length);
                this._dataView.setInt32(this._offset, ndoffset, true);
                this._dataView.setInt32(this._offset + 4, buffer.length, true);
                this._dataView.setInt32(this._offset + 8, buffer.length, true);
                copyArrayBuffer(buffer, 0, this._buffer, ndoffset, buffer.length);
            } else {
                const cap = this._dataView.getInt32(this._offset + 8, true);
                if (cap >= buffer.length) {
                    this._dataView.setInt32(this._offset + 4, buffer.length, true);
                    copyArrayBuffer(buffer, 0, this._buffer, dataOffset, this.length);
                } else {
                    const ndoffset = this.extendSubBuffer(dataOffset, cap, buffer.length);
                    this._dataView.setInt32(this._offset, ndoffset, true);
                    this._dataView.setInt32(this._offset + 4, buffer.length, true);
                    this._dataView.setInt32(this._offset + 8, buffer.length, true);
                    copyArrayBuffer(buffer, 0, this._buffer, ndoffset, buffer.length);
                    this.trashLength += cap;
                }
            }
        }
    }

    public get typeId(): number {
        return 12;
    }

    /**
     * Memory structure:  
     * `| data offset | str length | str capacity |`  
     * or  
     * `| 0b1 str len -- 1 byte | str Data -- 11 byte |`
     *
     * @readonly
     * @type {number}
     * @memberof StructString
     */
    public get byteLength(): number {
        return 12;
    }

    public gcStruct(): void {
        void (0);
    }
}

export abstract class StructMultiArray extends StructBase {

    public get size() {
        return this._dataView.getInt32(this._offset + 4, true);
    }

    public get capacity() {
        return this._dataView.getInt32(this._offset + 8, true);
    }

    public get dataOffset() {
        return this._dataView.getInt32(this._offset, true);
    }

    public abstract get dims(): number;

    public abstract get dataBytes(): number;

    public get typeId(): number {
        return 61;
    }

    /**
     * Memory structure:  
     * `| data offset | firstDim len | firstDim cap |`
     *
     * @readonly
     * @memberof StructArray
     */
    public get byteLength() {
        return 12;
    }

    public gcStruct(): void {
        void(0);
    }
}

export class StructMap extends StructBase {
    public get size() {
        return this._dataView.getInt32(this._offset, true);
    }

    public get capacity() {
        return this._dataView.getInt32(this._offset + 4, true);
    }

    public get dataOffset() {
        return this._dataView.getInt32(this._offset + 8, true);
    }

    public get typeId(): number {
        return 62;
    }

    /**
     * 4 byte: offset, 4 byte: capacity, 4 byte: length
     *
     * @readonly
     * @memberof StructArray
     */
    public get byteLength() {
        return 12;
    }

    public gcStruct(): void {
        void(0);
    }
}

export class StructCombine extends StructBase {

    /**
     * Only one offset(Ptr) store in the array.
     *
     * @readonly
     * @memberof StructCombine
     */
    public get dataOffset() {
        return this._dataView.getInt32(this._offset, true);
    }

    public get dataType() {
        return this._dataView.getInt32(this.dataOffset, true);
    }

    public get typeId(): number {
        return 63;
    }

    /**
     * The type store in the content of the Ptr.
     *
     * @memberof StructCombine
     */
    public get byteLength() {
        return 4;
    }

    public gcStruct(): void {
        void(0);
    }
}
