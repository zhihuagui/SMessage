
export interface NativeSupportType {
    literal: string;
    size: number;
}

export const NativeSupportTypes: NativeSupportType[] = [
    { literal: 'bool',      size: 1 },
    { literal: 'int8',      size: 1 },
    { literal: 'uint8',     size: 1 },
    { literal: 'int16',     size: 2 },
    { literal: 'uint16',    size: 2 },
    { literal: 'int32',     size: 4 },
    { literal: 'uint32',    size: 4 },
    { literal: 'float32',   size: 4 },
    { literal: 'int64',     size: 8 },
    { literal: 'uint64',    size: 8 },
    { literal: 'float64',   size: 8 },
    { literal: 'string',    size: 4 + 4 },
];

export interface BaseDescription {
    typeDescId: number;
    scope: string;
    typeName: string;
}

export interface EnumDescription extends BaseDescription {
    dataType: string;
    valueTypes: {
        name: string;
        value: number;
    }[];
}

export interface ICombineType {
    types: (NativeSupportType | number)[];
}

export interface ArrayType {
    baseType: NativeSupportType | ICombineType | ArrayType | MapType;
}

export interface MapType {
    keyType: NativeSupportType;
    valueType: NativeSupportType | ICombineType | ArrayType | MapType;
}

export interface StructDescription extends BaseDescription {
    size: number;
    members: {
        name: string;
        type: number | NativeSupportType | ICombineType | ArrayType | MapType;
    }[];
}

export interface SMessageSchemas {
    version: string;
    structDefs: StructDescription[];
    enumDefs: EnumDescription[];
}
