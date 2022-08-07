export const MINUserDefTypeId = 64;
export const CombineTypeId = 63 as const;
export const MapTypeId = 62 as const;
export const ArrayTypeId = 61 as const;

export enum TypeDescType {
    NativeSupportType,
    MapType,
    ArrayType,
    CombineType,
    UserDefType,
    Unsupport,
}
export interface ITypeDesc {
    descType: TypeDescType;
    typeId: number;
}
export interface NativeSupportType extends ITypeDesc {
    descType: TypeDescType.NativeSupportType;
    literal: string;
    byteSize: number;
}

export interface ICombineTypeDesc extends ITypeDesc {
    descType: TypeDescType.CombineType;
    typeId: typeof CombineTypeId;
    types: Exclude<AllTypeDesc, ICombineTypeDesc>[];
}

export interface IArrayTypeDesc extends ITypeDesc {
    descType: TypeDescType.ArrayType;
    typeId: typeof ArrayTypeId;
    baseType: AllTypeDesc;
    arrayDims: number;
}

export interface IMapTypeDesc extends ITypeDesc {
    descType: TypeDescType.MapType;
    typeId: typeof MapTypeId;
    keyType: NativeSupportType;
    valueType: AllTypeDesc;
}

export interface IUserDefTypeDesc extends ITypeDesc {
    descType: TypeDescType.UserDefType;
    typeId: number;
}

export type AllTypeDesc = NativeSupportType | IArrayTypeDesc | IMapTypeDesc | IUserDefTypeDesc | ICombineTypeDesc;

export const NativeSupportTypes: NativeSupportType[] = [
    { descType: TypeDescType.NativeSupportType, typeId: 1, literal: 'bool', byteSize: 1 },
    { descType: TypeDescType.NativeSupportType, typeId: 2, literal: 'int8', byteSize: 1 },
    { descType: TypeDescType.NativeSupportType, typeId: 3, literal: 'uint8', byteSize: 1 },
    { descType: TypeDescType.NativeSupportType, typeId: 4, literal: 'int16', byteSize: 2 },
    { descType: TypeDescType.NativeSupportType, typeId: 5, literal: 'uint16', byteSize: 2 },
    { descType: TypeDescType.NativeSupportType, typeId: 6, literal: 'int32', byteSize: 4 },
    { descType: TypeDescType.NativeSupportType, typeId: 7, literal: 'uint32', byteSize: 4 },
    { descType: TypeDescType.NativeSupportType, typeId: 8, literal: 'float32', byteSize: 4 },
    { descType: TypeDescType.NativeSupportType, typeId: 9, literal: 'int64', byteSize: 8 },
    { descType: TypeDescType.NativeSupportType, typeId: 10, literal: 'uint64', byteSize: 8 },
    { descType: TypeDescType.NativeSupportType, typeId: 11, literal: 'float64', byteSize: 8 },
    { descType: TypeDescType.NativeSupportType, typeId: 12, literal: 'string', byteSize: 4 + 4 },
];

export interface BaseDescription {
    typeId: number;
    scope: string;
    typeName: string;
}

export interface EnumDescription extends BaseDescription {
    dataType: NativeSupportType;
    valueTypes: {
        name: string;
        value: number;
    }[];
}

export interface StructDescription extends BaseDescription {
    size: number;
    members: {
        name: string;
        type: AllTypeDesc;
    }[];
}

export interface SMessageSchemas {
    version: string;
    structDefs: StructDescription[];
    enumDefs: EnumDescription[];
}
