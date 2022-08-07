
export class StructBase {
    constructor(buf: ArrayBuffer, offset: number) {
        this._buffer = buf;
        this._offset = offset;
        this._dataView = new DataView(buf);
    }

    public reset(buf: ArrayBuffer, offset: number) {
        this._buffer = buf;
        this._offset = offset;
        this._dataView = new DataView(buf);
    }

    public get usedLength() {
        return this._dataView.getInt32(0, true);
    }

    public get spaceLength() {
        return this._dataView.getInt32(4, true);
    }

    protected _dataView: DataView;
    protected _buffer: ArrayBuffer;
    protected _offset: number;
}

export class StructArray extends StructBase {

    public get size() {
        return this._dataView.getInt32(this._offset, true);
    }

    public get capacity() {
        return this._dataView.getInt32(this._offset + 4, true);
    }


}
