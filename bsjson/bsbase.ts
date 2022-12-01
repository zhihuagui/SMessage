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

type JsonValue = string | number | boolean | null | JsonArray | JsonObject;

export type JsonArray = JsonValue[];
export interface JsonObject {
    [key: string]: JsonValue;
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
            if (left < strs[i].length >> 2) {
                this.updateCapacity(this.mBuffer.length * 2);
            }
            const rst = textEncoder.encodeInto(strs[i], this.mBuffer.subarray(this.mCurrentOffset));
            this.mCurrentOffset += rst.written || 0;
            this.mDataview.setUint8(this.mCurrentOffset, 0);
            this.mCurrentOffset++;
        }
        return startPos;
    }

    public appendString(str: string) {
        const left = this.mBuffer.length - this.mCurrentOffset;
        if (left < str.length >> 2) {
            this.updateCapacity(this.mBuffer.length * 2);
        }
        const startPos = this.mCurrentOffset;
        const rst = textEncoder.encodeInto(str, this.mBuffer.subarray(this.mCurrentOffset));
        this.mCurrentOffset += rst.written || 0;
        this.mDataview.setUint8(this.mCurrentOffset, 0);
        this.mCurrentOffset++;
        return startPos;
    }

    public appendNumber(num: number) {
        const left = this.mBuffer.length - this.mCurrentOffset;
        if (left < 8) {
            this.updateCapacity(this.mBuffer.length * 2);
        }
        this.mDataview.setFloat64(this.mCurrentOffset, num, true);
        const ret = this.mCurrentOffset;
        this.mCurrentOffset += 8;
        return ret;
    }

    public setInt32(offset: number, value: number) {
        this.mDataview.setInt32(offset, value, true);
    }

    public getInt32(offset: number) {
        return this.mDataview.getInt32(offset, true);
    }

    public setUint16(offset: number, value: number) {
        this.mDataview.setUint16(offset, value, true);
    }

    public getUint16(offset: number) {
        this.mDataview.getUint16(offset);
    }

    public setUint8(offset: number, value: number) {
        this.mDataview.setUint8(offset, value);
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

export class BsViewUtil {
    public static getStringBytes(bv: DataView, offset: number) {
        for (let i = offset; i < bv.byteLength; i++) {
            if (bv.getUint8(i) === 0) {
                return i - offset;
            }
        }
        return 0;
    }
}
