import type { BsObject } from './bsobject';
import type { BsArray } from './bsarray';

/**
 * 定义所有BsJSON用到的类型, 占一个字节
 */
export enum ETypeCode {
    /** key: string，Iterator访问 */
    Object = 1,
    ObjectRef,
    /** key: number，Iterator访问 */
    IndexedObject,
    IndexedObjectRef,
    /** key: number, 可log(n)随机访问 */
    SortedIndexedObject,
    SortedIndexedObjectRef,
    /** 可Index随机访问 */
    Array,
    ArrayRef,
    /** 只可Iterator访问 */
    LinkedList,
    LinkedListRef,
    String,
    StringRef,
    Float64,
    Int32,
    Uint32,
    False,
    True,
    Null,
}

export const textEncoder = new TextEncoder();
export const textDecoder = new TextDecoder();
export class BsBuffer {
    constructor(expectLen: number) {
        this.mBuffer = new Uint8Array(expectLen);
        this.mDataview = new DataView(this.mBuffer.buffer);
        this.mCurrentOffset = 0;
    }

    public updateCapacity(size: number) {
        const newBuffer = new Uint8Array(size);
        this.mDataview = new DataView(newBuffer.buffer);
        newBuffer.set(this.mBuffer, 0);
    }

    public appendStringList(strs: string[]) {
        const startPos = this.mCurrentOffset;
        for (let i = 0; i < strs.length; i++) {
            const left = this.mBuffer.length - this.mCurrentOffset;
            if (left < strs[i].length >> 1) {
                this.updateCapacity(this.mBuffer.length * 3);
            }
            const rst = textEncoder.encodeInto(strs[i], this.mBuffer.subarray(this.mCurrentOffset));
            this.mCurrentOffset += rst.written || 0;
            this.mDataview.setUint8(this.mCurrentOffset, 0);
            this.mCurrentOffset++;
        }
        return startPos;
    }

    public setInt32(offset: number, value: number) {
        this.mDataview.setInt32(offset, value, true);
    }

    public getInt32(offset: number) {
        return this.mDataview.getInt32(offset, true);
    }

    public mBuffer: Uint8Array;
    public mDataview: DataView;
    public mCurrentOffset: number;
}

class BsValueFactory {
    constructor() {
        this.mCreateArray = undefined;
        this.mCreateObject = undefined;
    }

    public createBsObject(view: DataView, offset: number): BsObject {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.mCreateObject!(view, offset);
    }

    public createBsArray(view: DataView, offset: number): BsArray {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.mCreateArray!(view, offset);
    }

    public registerArrayCreator(contr: (view: DataView, offset: number) => BsArray) {
        this.mCreateArray = contr;
    }

    public registerObjectCreator(contr: (view: DataView, offset: number) => BsObject) {
        this.mCreateObject = contr;
    }

    private mCreateArray: ((view: DataView, offset: number) => BsArray) | undefined;
    private mCreateObject: ((view: DataView, offset: number) => BsObject) | undefined;
}

export const bsValueFactory = new BsValueFactory();
