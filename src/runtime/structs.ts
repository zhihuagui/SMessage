
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
    static byteLength() {
        return 4;
    }

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
    public get $_trashLength() {
        return this._dataView.getInt32(4, true);
    }

    public set $_trashLength(len: number) {
        this._dataView.setInt32(4, len, true);
    }

    /**
     * 下一个可用空间的Offset
     *
     * @readonly
     * @memberof StructBase
     */
    public get $_nextAvailableOffset() {
        return this._dataView.getInt32(8, true);
    }

    public set $_nextAvailableOffset(nxtOffset: number) {
        this._dataView.setInt32(8, nxtOffset, true);
    }

    public abstract get typeId(): number;

    public abstract get byteLength(): number;

    public abstract $_gcStruct(): void;

    protected get _dataView() {
        return this._sBuffer._dataView;
    }
    protected get _buffer() {
        return this._sBuffer._buffer;
    }

    protected $_updateCapacity(minAddCapacity: number) {
        if (this._offset !== 12) {
            throw new Error('Cannot update capacity in a non-root struct.');
        }

        if (this.$_trashLength / this.$_nextAvailableOffset > trashToGCRatio) {
            throw new Error('GC shold be impled.');
        } else {
            const nxtSize = Math.max(this._buffer.byteLength * 2, this._buffer.byteLength + Math.floor(this._buffer.byteLength * 0.5) + minAddCapacity);
            const newBuffer = new ArrayBuffer(nxtSize);
            copyArrayBuffer(this._buffer, 0, newBuffer, 0, this.$_nextAvailableOffset);
            this._sBuffer.reset(newBuffer);
        }
    }

    protected $_extendSubBuffer(offset: number, originLength: number, toLength: number) {
        if (originLength >= toLength) {
            return offset;
        }
        let nxtavail = this.$_nextAvailableOffset;
        if (offset + originLength === nxtavail) {
            nxtavail += toLength - originLength;
            if (nxtavail > this._sBuffer._buffer.byteLength) {
                this.$_updateCapacity(nxtavail - this._sBuffer._buffer.byteLength);
                this.$_nextAvailableOffset = nxtavail;
            }
            return offset;
        } else {
            const ret = nxtavail;
            nxtavail += toLength;
            if (nxtavail > this._sBuffer._buffer.byteLength) {
                this.$_updateCapacity(nxtavail - this._sBuffer._buffer.byteLength);
                this.$_nextAvailableOffset = nxtavail;
            }
            return ret;
        }
    }

    public $_createSubBuffer(byteLength: number) {
        const curOffset = this.$_nextAvailableOffset;
        const nxtavail = curOffset + byteLength;
        if (nxtavail > this._sBuffer._buffer.byteLength) {
            this.$_updateCapacity(nxtavail - this._sBuffer._buffer.byteLength);
            this.$_nextAvailableOffset = nxtavail;
        }
        return curOffset;
    }

    protected $_updateOffset(newOffset: number) {
        this._offset = newOffset;
    }

    public copyArrayBuffer(src: ArrayBuffer, soffset: number, target: ArrayBuffer, toffset: number, length: number) {
        const srcDV = new DataView(src);
        const tgtDV = new DataView(target);
        for (let i = 0; i < length; i++) {
            tgtDV.setUint8(i + toffset, srcDV.getUint8(i + soffset));
        }
    }

    public copyToBuffer(sBuf: StructBuffer, offset: number) {
        if (sBuf === this._sBuffer) {
            copyArrayBuffer(this._sBuffer._buffer, this._offset, sBuf._buffer, offset, this.byteLength);
        } else {
            throw new Error('Should implement');
        }
    }

    public $_structBuf() {
        return this._sBuffer;
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

    public getStringBuffer() {
        const dataOffset = this._dataView.getInt32(this._offset, true);
        if (dataOffset > 0) {
            const len = this._dataView.getInt32(this._offset + 4, true);
            return new Uint8Array(this._buffer, dataOffset, len);
        } else {
            const len = this._dataView.getInt8(this._offset) & 0x7F;
            return new Uint8Array(this._buffer, this._offset + 1, len);
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
                const ndoffset = this.$_createSubBuffer(buffer.length);
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
                    const ndoffset = this.$_extendSubBuffer(dataOffset, cap, buffer.length);
                    this._dataView.setInt32(this._offset, ndoffset, true);
                    this._dataView.setInt32(this._offset + 4, buffer.length, true);
                    this._dataView.setInt32(this._offset + 8, buffer.length, true);
                    copyArrayBuffer(buffer, 0, this._buffer, ndoffset, buffer.length);
                    this.$_trashLength += cap;
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

    public $_gcStruct(): void {
        void (0);
    }
}

export abstract class StructArray extends StructBase {

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

    public abstract get typeId(): number;

    public reserve(count: number) {
        let originOffset = 0;
        let originByte = 0;
        if (this.dataOffset !== 0) {
            if (this.capacity >= count) {
                return;
            }
            originOffset = this.dataOffset;
            originByte = this.capacity * this.dataBytes;
            this.$_trashLength += originByte;
        }
        const newBuf = this.$_createSubBuffer(count * this.dataBytes);
        this._dataView.setInt32(this._offset, newBuf, true);
        this._dataView.setInt32(this._offset + 8, count, true);
        this._dataView.setInt32(this._offset + 4, this.size, true);
        if (originOffset) {
            copyArrayBuffer(this._sBuffer._buffer, originOffset, this._sBuffer._buffer, this.dataOffset, originByte);
        }
    }

    /**
     * 增加一个元素，指定了src则会从src复制
     *
     * @param {number} [src]
     * @memberof StructArray
     */
    public pushElement(src?: number) {
        if (this.capacity - this.size < 1) {
            this.reserve(Math.min(this.capacity * 2, this.capacity + 20));
        }
        const existSize = this.size;
        this._dataView.setInt32(this._offset + 4, existSize + 1, true);

        if (src) {
            copyArrayBuffer(this._sBuffer._buffer, src, this._sBuffer._buffer, this.dataOffset + this.dataBytes * existSize, this.dataBytes);
        }
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

    public $_gcStruct(): void {
        void(0);
    }
}

export abstract class StructMap extends StructBase {
    public get size() {
        return this._dataView.getInt32(this._offset, true);
    }

    public get capacity() {
        return this._dataView.getInt32(this._offset + 4, true);
    }

    public get dataOffset() {
        return this._dataView.getInt32(this._offset + 8, true);
    }

    public abstract get typeId(): number;

    public abstract get keyByte(): number;

    public abstract get valueByte(): number;

    /**
     * 4 byte: data offset, 4 byte: capacity, 4 byte: length
     *
     * @readonly
     * @memberof StructArray
     */
    public get byteLength() {
        return 12;
    }

    public $_gcStruct(): void {
        void(0);
    }

    public compareString(left: string | StructString, right: string | StructString) {
        const bufLeft = typeof left === 'string' ? utf8Encoder.encode(left) : left.getStringBuffer();
        const bufRight = typeof right === 'string' ? utf8Encoder.encode(right) : right.getStringBuffer();
        const compareLen = Math.min(bufLeft.length, bufRight.length);
        for (let i = 0; i < compareLen; i++) {
            if (bufLeft[i] < bufRight[i]) {
                return 1;
            } else if (bufLeft[i] > bufRight[i]) {
                return -1;
            }
        }
        if (bufLeft.length < bufRight.length) {
            return 1;
        } else if (bufLeft.length > bufRight.length) {
            return -1;
        }
        return 0;
    }

    protected toUint8Array(str: string) {
        return utf8Encoder.encode(str);
    }
}

export abstract class StructCombine extends StructBase {

    /**
     * Only one offset(Ptr) store in the array.
     *
     * @readonly
     * @memberof StructCombine
     */
    public get dataOffset() {
        return this._dataView.getInt32(this._offset + 4, true);
    }

    public get dataType() {
        return this._dataView.getInt32(this.dataOffset, true);
    }

    public abstract get typeId(): number;

    /**
     * CombineType 使用8字节，其中前4字节标示类型，后4字节如果类型长度<=4,那么标示为值，否则存储指针
     * 当一个struct包含了combine类型的时候，它的byte一定是大于4的，所以不会发生循环包含的情况
     *
     * @memberof StructCombine
     */
    public get byteLength() {
        return 8;
    }

    public $_gcStruct(): void {
        void(0);
    }
}
