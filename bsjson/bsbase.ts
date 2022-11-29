import type { BsObject } from './bsobject';
import type { BsArray } from './bsarray';

/**
 * 定义所有BsJSON用到的类型
 */
export enum ETypeCode {
    Object = 1,
    Array,
    ObjectRef,
    ArrayRef,
    String,
    StringRef,
    Float64,
    Int32,
    False,
    True,
    Null,
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
export const textEncoder = new TextEncoder();
export const textDecoder = new TextDecoder();
