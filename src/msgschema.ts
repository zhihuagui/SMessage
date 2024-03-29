import { StructBase, StructCombine, StructMap, StructArray, StructString } from './runtime/structs';

export const StructBaseId = 59 as const;
export const StringTypeId = 60 as const;
export const ArrayTypeId = 61 as const;
export const MapTypeId = 62 as const;
export const CombineTypeId = 63 as const;
export const MINUserDefTypeId = 64;

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

export interface IAccessoryDesc {
    type: 'mapArray' | 'mapStruct' | 'combineType';
    typeId: number;
    byteLength: number;
    relyTypes: number[];
    typeName: string;
    noAccessoryName: string;
    humanReadName: string;
    scope: string;
}

export interface PreDefinedStructType {
    typeId: number;
    preDefinedClassName: string;
    preDefinedClass: typeof StructBase
}

export interface ICombineTypeDesc extends ITypeDesc {
    descType: TypeDescType.CombineType;
    typeId: typeof CombineTypeId;
    types: Exclude<AllTypeDesc, ICombineTypeDesc>[];
    accessory?: IAccessoryDesc;
}

export interface IArrayTypeDesc extends ITypeDesc {
    descType: TypeDescType.ArrayType;
    typeId: typeof ArrayTypeId;
    baseType: AllTypeDesc;
    arrayDims: number;
    accessory?: IAccessoryDesc;
}

export interface IMapTypeDesc extends ITypeDesc {
    descType: TypeDescType.MapType;
    typeId: typeof MapTypeId;
    keyType: NativeSupportType;
    valueType: AllTypeDesc;
    accessory?: IAccessoryDesc;
}

export interface IUserDefTypeDesc extends ITypeDesc {
    descType: TypeDescType.UserDefType;
    typeId: number;
    typeName: string;
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
    { descType: TypeDescType.NativeSupportType, typeId: StringTypeId, literal: 'string', byteSize: StructString.prototype.byteLength },
];

export const PredefinedTypes: PreDefinedStructType[] = [
    { typeId: StringTypeId, preDefinedClass: StructString, preDefinedClassName: 'StructString' },
    { typeId: ArrayTypeId, preDefinedClass: StructArray, preDefinedClassName: 'StructArray' },
    { typeId: MapTypeId, preDefinedClass: StructMap, preDefinedClassName: 'StructMap' },
    { typeId: CombineTypeId, preDefinedClass: StructCombine, preDefinedClassName: 'StructCombine' },
    { typeId: StructBaseId, preDefinedClass: StructBase, preDefinedClassName: 'StructBase' },
];

export interface BaseDescription {
    typeId: number;
    scope: string;
    typeName: string;
}

export interface EnumDescription extends BaseDescription {
    type: 'enum';
    dataType: NativeSupportType;
    valueTypes: {
        name: string;
        value: number;
    }[];
}

export enum EMemberRefType {
    unknow = 0,
    inline = 1,
    reference = 2,
}

/**
 * 初始化状态offset为-1，refType是unkonw
 * 实际状态，refType和offset必须有正常的值
 */
export interface StructDescription extends BaseDescription {
    type: 'struct';
    byteLength: number;
    dependences: number[];
    members: {
        name: string;
        refType: EMemberRefType;
        offset: number;
        type: AllTypeDesc;
        typeId: number;
    }[];
}

export interface SMessageSchemas {
    version: string;
    structDefs: StructDescription[];
    enumDefs: EnumDescription[];
    accessories: IAccessoryDesc[];
}
