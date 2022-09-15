import * as fs from 'fs';
import { IBaseType, IEnumDef, ISMSGParserResult, IStructDef, parseMIDL } from './parser';
import {
    AllTypeDesc,
    ICombineTypeDesc,
    EnumDescription,
    SMessageSchemas,
    StructDescription,
    TypeDescType,
    IMapTypeDesc,
    NativeSupportTypes,
    IUserDefTypeDesc,
    IArrayTypeDesc,
    MINUserDefTypeId,
    PredefinedTypes,
    IAccessoryDesc,
    EMemberRefType,
} from './msgschema';
import { ICombineType as IParserCombineType } from './parser';
import { isGraterOrEqualThan } from './version';
import { StructCombine, StructMap, StructArray } from './runtime/structs';

type EnumTypeDef = {
    type: 'enum';
    fileName: string;
    scope: string;
    name: string;
    typeId: number;
    cst: IEnumDef;
};

type StructTypeDef = {
    type: 'struct';
    fileName: string;
    scope: string;
    name: string;
    typeId: number;
    cst: IStructDef;
};

type ImportTypeDef = {
    type: 'import';
    fileName: string;
    scope: string;
    importNames: string[];
    fromScope: string;
};

type RawTypeDef = EnumTypeDef | StructTypeDef | ImportTypeDef;

export class SMessageCompiler {
    constructor(files: string[], currVersion: string, historyFile?: string) {
        this._version = currVersion;
        this._idlFiles = files;
        this._historyFile = historyFile;
        this.initPrevSchema();
    }

    public compileAllFiles() {
        this._idlFiles.forEach((fname) => {
            if (fs.statSync(fname).isFile()) {
                const fileStr = fs.readFileSync(fname).toString();
                try {
                    const rst = parseMIDL(fileStr);
                    if (rst.lexError.length === 0 && rst.parseError.length === 0) {
                        this._fileNameToCst.set(fname, rst.cst);
                    } else {
                        rst.lexError.forEach((lexerr) => {
                            console.log(`${lexerr.message}`);
                        });
                        rst.parseError.forEach((perr) => {
                            console.log(`${perr.message}`);
                        });
                    }
                } catch (err) {
                    console.log(`Ignore file ${fname}, due to parse error: ${err}.`);
                }
            }
        });
        this.analyseAllFiles();
    }

    private analyseAllFiles() {
        const objectDefs: RawTypeDef[] = [];
        const pkg2file: Map<string, string> = new Map();
        const file2pkg: Map<string, string> = new Map();

        this._fileNameToCst.forEach((cst, fname) => {
            const pkgs = cst.children['package'];
            if (pkgs && pkgs.length === 1) {
                const pkgNames = pkgs[0].children.packageName[0].children.Literal.map((tk) => tk.image);
                const pkgStrs = pkgNames.join('.');
                if (pkg2file.has(pkgStrs)) {
                    throw new Error(`Error: in ${fname}, The package ${pkgStrs} has already declared in ${pkg2file.get(pkgStrs)}.`);
                }
                pkg2file.set(pkgStrs, fname);
                file2pkg.set(fname, pkgStrs);
                return;
            }
            throw new Error(`The file: ${fname} has no package defs, or have multi package defs.`);
        });

        this._fileNameToCst.forEach((cst, fname) => {
            const scope = file2pkg.get(fname);
            if (!scope) {
                return;
            }
            const structs = cst.children['struct'];
            const enums = cst.children['enum'];
            const imports = cst.children['import'];
            if (enums) {
                enums.forEach((enit) => {
                    const enumName = enit.children.Literal[0].image;
                    objectDefs.push({
                        name: enumName,
                        fileName: fname,
                        type: 'enum',
                        cst: enit,
                        scope,
                        typeId: this._getAdditionalRawType({ name: enumName, scope }),
                    });
                });
            }
            if (structs) {
                structs.forEach((stuts) => {
                    const structName = stuts.children.Literal[0].image;
                    objectDefs.push({
                        name: structName,
                        fileName: fname,
                        type: 'struct',
                        cst: stuts,
                        scope,
                        typeId: this._getAdditionalRawType({ name: structName, scope }),
                    });
                    // stuts.children.memberDefine.forEach((memdef) => {
                    //     const memName = memdef.children.Literal[0].image;
                    //     const memStr = this.combineTypeToString(memdef.children.combineType[0]);
                    //     console.log(`memName: ${memName}, memtype: ${memStr}`);
                    // });
                });
            }
            if (imports) {
                imports.forEach((ipt) => {
                    const fromPkg = ipt.children.packageName[0].children.Literal.map((tk) => tk.image).join('.');
                    const fromFile = pkg2file.get(fromPkg);
                    if (!fromFile) {
                        throw new Error(`Cannot find the package: ${fromPkg} in any file.`);
                    }
                    const imports = ipt.children.Literal.map((ipnm) => ipnm.image);
                    objectDefs.push({
                        fileName: fname,
                        type: 'import',
                        scope,
                        importNames: imports,
                        fromScope: fromPkg,
                    });
                });
            }
        });

        this.generateRawTypeMaps(objectDefs);

        const currSchema: SMessageSchemas = {
            version: this._version,
            enumDefs: [],
            structDefs: [],
            accessories: [],
        };
        objectDefs.forEach((typedef) => {
            if (typedef.type === 'enum') {
                currSchema.enumDefs.push(this._enumDefToEnumDesc(typedef));
            } else if (typedef.type === 'struct') {
                const structDesc = this._structDefToStructDesc(typedef);
                currSchema.structDefs.push(structDesc);
                this._id2Structs.set(structDesc.typeId, structDesc);
            }
        });

        this._analyseMemberAndByteForAllStruct(currSchema);

        this._id2Accessory.forEach((v) => {
            currSchema.accessories.push(v);
        });

        this._currentSchema = currSchema;
    }

    /**
     * 以4字节对齐的方式，分析Struct的Bytes和member的type
     *
     * @private
     * @param {SMessageSchemas} msgs
     * @memberof SMessageCompiler
     */
    private _analyseMemberAndByteForAllStruct(msgs: SMessageSchemas) {
        const id2Types: Map<number, StructDescription | EnumDescription> = new Map();
        msgs.enumDefs.forEach((ed) => {
            id2Types.set(ed.typeId, ed);
        });
        msgs.structDefs.forEach((sd) => {
            id2Types.set(sd.typeId, sd);
        });

        msgs.structDefs.forEach((sd) => {
            this._analyseStructDesc(sd, id2Types);
        });
    }

    private _analyseStructDesc(sDesc: StructDescription, id2Types: Map<number, StructDescription | EnumDescription>): StructDescription {
        if (this._structAnalyzed.has(sDesc.typeId)) {
            const rst = this._id2Structs.get(sDesc.typeId);
            if (!rst) {
                throw new Error('Should have been analyzed.');
            }
            return rst;
        }
        this._structAnalyzed.add(sDesc.typeId);
        const byteAlign = 4;
        let byteSize = 0;
        for (let i = 0; i < sDesc.members.length; i++) {
            const member = sDesc.members[i];
            const mtDesc = member.type;
            if (mtDesc.descType === TypeDescType.NativeSupportType) {
                const descByte = mtDesc.byteSize;
                byteSize = this._increaseByteWithAlign(byteSize, descByte, Math.min(byteAlign, descByte));
                member.refType = EMemberRefType.inline;
                member.offset = byteSize - descByte;
                member.typeId = mtDesc.typeId;
            } else if (mtDesc.descType === TypeDescType.MapType) {
                const desc = PredefinedTypes.find(t => t.typeId === mtDesc.typeId);
                if (!desc) {
                    throw new Error('The mtDesc should be preDefined.');
                }
                const psByte = desc.preDefinedClass.prototype.byteLength;
                byteSize = this._increaseByteWithAlign(byteSize, psByte, Math.min(byteAlign, psByte));
                const insId = this._generateAccessoryType(mtDesc, sDesc.scope);
                mtDesc.accessory = this._id2Accessory.get(insId);
                member.refType = EMemberRefType.inline;
                member.offset = byteSize - psByte;
                member.typeId = insId;
            } else if (mtDesc.descType === TypeDescType.ArrayType) {
                const desc = PredefinedTypes.find(t => t.typeId === mtDesc.typeId);
                if (!desc) {
                    throw new Error('The mtDesc should be preDefined.');
                }
                const psByte = desc.preDefinedClass.prototype.byteLength;
                byteSize = this._increaseByteWithAlign(byteSize, psByte, Math.min(byteAlign, psByte));
                const insId = this._generateAccessoryType(mtDesc, sDesc.scope);
                mtDesc.accessory = this._id2Accessory.get(insId);
                member.refType = EMemberRefType.inline;
                member.offset = byteSize - psByte;
                member.typeId = insId;
            } else if (mtDesc.descType === TypeDescType.CombineType) {
                const desc = PredefinedTypes.find(t => t.typeId === mtDesc.typeId);
                if (!desc) {
                    throw new Error('The mtDesc should be preDefined.');
                }
                const psByte = desc.preDefinedClass.prototype.byteLength;
                byteSize = this._increaseByteWithAlign(byteSize, psByte, Math.min(byteAlign, psByte));
                const insId = this._generateAccessoryType(mtDesc, sDesc.scope);
                mtDesc.accessory = this._id2Accessory.get(insId);
                member.refType = EMemberRefType.inline;
                member.offset = byteSize - psByte;
                member.typeId = insId;
            } else if (mtDesc.descType === TypeDescType.UserDefType) {
                const dTDesc = id2Types.get(mtDesc.typeId);
                if (dTDesc && 'byteLength' in dTDesc) {
                    const arst = this._analyseStructDesc(dTDesc, id2Types);
                    let memByte = arst.byteLength;
                    if (this._isTypeDirectDependenceBy(sDesc, arst)) {
                        member.refType = EMemberRefType.reference;
                        memByte = 4;
                    } else {
                        member.refType = EMemberRefType.inline;
                    }
                    byteSize = this._increaseByteWithAlign(byteSize, memByte, Math.min(byteAlign, 4));
                    member.offset = byteSize - memByte;
                    member.typeId = arst.typeId;
                } else if (dTDesc && 'dataType' in dTDesc) {
                    member.refType = EMemberRefType.inline;
                    byteSize = this._increaseByteWithAlign(byteSize, dTDesc.dataType.byteSize, Math.min(byteAlign, dTDesc.dataType.byteSize));
                    member.offset = byteSize - dTDesc.dataType.byteSize;
                    member.typeId = dTDesc.dataType.typeId;
                } else {
                    throw new Error(`Unsupport type id: ${mtDesc.typeId}`);
                }
            } else {
                throw new Error(`Error while deal the type: ${JSON.stringify(mtDesc)}`);
            }
        }
        if (byteSize === 0) {
            throw new Error(`Deal with type: ${sDesc.scope}:${sDesc.typeName} error.`);
        }
        sDesc.byteLength = byteSize;
        return sDesc;
    }

    private _increaseByteWithAlign(btSize: number, increase: number, alignSize: number) {
        const remainder = btSize % alignSize;
        if (remainder > 0) {
            return btSize + alignSize - remainder + increase;
        }
        return btSize + increase;
    }

    /**
     * 从CST类型转换为StructDescription
     *
     * @private
     * @param {StructTypeDef} structDef CST的Struct类型
     * @return {*}  {StructDescription}
     * @memberof SMessageCompiler
     */
    private _structDefToStructDesc(structDef: StructTypeDef): StructDescription {
        const ret: StructDescription = {
            type: 'struct',
            typeId: structDef.typeId,
            scope: structDef.scope,
            typeName: structDef.name,
            byteLength: 0,
            members: [],
            dependences: [],
        };
        structDef.cst.children.memberDefine.forEach((memberDef) => {
            const memberName = memberDef.children.Literal[0].image;
            const memberType = this._cstTypeToTypeDesc(structDef.scope, memberDef.children.combineType[0]);
            ret.members.push({
                name: memberName,
                type: memberType,
                refType: EMemberRefType.unknow,
                offset: -1,
                typeId: -1,
            });
            if (memberType.descType === TypeDescType.UserDefType) {
                ret.dependences.push(memberType.typeId);
            }
        });
        return ret;
    }

    private _enumDefToEnumDesc(enumDef: EnumTypeDef): EnumDescription {
        let dataTypeStr = 'int32';
        if (enumDef.cst.children.enumDataType) {
            dataTypeStr = enumDef.cst.children.enumDataType[0].children.Literal[0].image;
        }
        const dataType = NativeSupportTypes.find((tp) => tp.literal === dataTypeStr);
        if (!dataType || dataType.byteSize > 4) {
            throw new Error(`The datatype ${dataTypeStr} cannot use as enum type.`);
        }
        const ret: EnumDescription = {
            type: 'enum',
            typeId: enumDef.typeId,
            scope: enumDef.scope,
            typeName: enumDef.name,
            dataType,
            valueTypes: [],
        };
        enumDef.cst.children.enumMember.forEach((member) => {
            const name = member.children.Literal[0].image;
            let value: number;
            if (member.children.NumberLiteral) {
                value = parseInt(member.children.NumberLiteral[0].image);
            } else {
                value = ret.valueTypes.length > 0 ? ret.valueTypes[ret.valueTypes.length - 1].value + 1 : 1;
            }
            ret.valueTypes.push({ name, value });
        });
        return ret;
    }

    private _cstTypeToTypeDesc(scope: string, combType: IParserCombineType): AllTypeDesc {
        const compTypes = combType.children.baseType;
        if (compTypes.length > 1) {
            const ret: ICombineTypeDesc = {
                descType: TypeDescType.CombineType,
                typeId: 63,
                types: [],
            };
            compTypes.forEach((btype) => {
                const btypedef = this._subTypeToTypeDesc(scope, btype);
                ret.types.push(btypedef);
            });
            return ret;
        }
        return this._subTypeToTypeDesc(scope, compTypes[0]);
    }

    private _subTypeToTypeDesc(scope: string, btype: IBaseType): Exclude<AllTypeDesc, ICombineTypeDesc> {
        if ('Comma' in btype.children) {
            const keyType = this.typeStringToType(scope, btype.children.Literal[0].image);
            if (keyType.descType === TypeDescType.UserDefType) {
                throw new Error(`The UserDefined type ${btype.children.Literal[0].image} cannot use as map key.`);
            }
            const ret: IMapTypeDesc = {
                descType: TypeDescType.MapType,
                typeId: 62,
                keyType,
                valueType: this._cstTypeToTypeDesc(scope, btype.children.combineType[0]),
            };
            return ret;
        } else if ('Literal' in btype.children) {
            const sqNum = btype.children.LSquare ? btype.children.LSquare.length : 0;
            if (sqNum > 0) {
                const ret: IArrayTypeDesc = {
                    descType: TypeDescType.ArrayType,
                    typeId: 61,
                    arrayDims: sqNum,
                    baseType: this.typeStringToType(scope, btype.children.Literal[0].image),
                };
                return ret;
            } else {
                return this.typeStringToType(scope, btype.children.Literal[0].image);
            }
        } else if ('combineType' in btype.children) {
            const sqNum = btype.children.LSquare ? btype.children.LSquare.length : 0;
            if (sqNum > 0) {
                const ret: IArrayTypeDesc = {
                    descType: TypeDescType.ArrayType,
                    typeId: 61,
                    arrayDims: sqNum,
                    baseType: this._cstTypeToTypeDesc(scope, btype.children.combineType[0]),
                };
                return ret;
            } else {
                throw new Error(`Cannot define Combine type in combine Type.`);
            }
        }
        throw new Error(`Unsupport base type.`);
    }

    private _isTypeDirectDependenceBy(type: StructDescription, checkType: StructDescription) {
        const checkDeps = (dep: number, sets: Set<number>) => {
            if (sets.has(dep)) {
                return;
            }
            sets.add(dep);
            const sdesc = this._id2Structs.get(dep);
            if (sdesc) {
                sdesc.dependences.forEach(sdep => {
                    checkDeps(sdep, sets);
                });
            }
        }
        const depSets = new Set<number>();
        checkType.dependences.forEach(dep => checkDeps(dep, depSets));
        return depSets.has(type.typeId);
    }

    private typeStringToType(scope: string, typeName: string) {
        const ntvType = NativeSupportTypes.find((tp) => tp.literal === typeName);
        if (ntvType) {
            return ntvType;
        }
        const rawTypeKey = `${typeName}$${scope}`;
        const rawType = this._rawTypeMapping.get(rawTypeKey);
        if (rawType) {
            const ret: IUserDefTypeDesc = {
                descType: TypeDescType.UserDefType,
                typeName: rawType.name,
                typeId: -1,
            };
            if (rawType.type === 'enum') {
                ret.typeId = rawType.typeId;
            } else if (rawType.type === 'struct') {
                ret.typeId = rawType.typeId;
            }
            if (ret.typeId < 0) {
                throw new Error(`The type: ${typeName} in file: ${scope} is unsupoort.`);
            }
            return ret;
        }
        throw new Error(`The type: ${typeName} in file: ${scope} is undefined.`);
    }

    private combineTypeToString(combType: IParserCombineType): string {
        const baseTypes = combType.children.baseType;
        const btypeStrs = baseTypes.map((btype) => {
            if ('Comma' in btype.children) {
                /** <keytype, valuetype> 是一个Map类型 */
                const kimg = btype.children.Literal[0].image;
                const img = this.combineTypeToString(btype.children.combineType[0]);
                return `Map<${kimg}, ${img}>`;
            } else if ('Literal' in btype.children) {
                /** literal([]..) 是一个名字类型或者名字的数组类型 */
                const sqNum = btype.children.LSquare ? btype.children.LSquare.length : 0;
                const img = btype.children.Literal[0].image;
                return `${img}${this.getRepeatRepeats(sqNum, '[]')}`;
            } else if ('combineType' in btype.children) {
                /** 是一个组合后的类型或者组合后的数组类型 */
                const sqNum = btype.children.LSquare ? btype.children.LSquare.length : 0;
                const img = this.combineTypeToString(btype.children.combineType[0]);
                return `${img}${this.getRepeatRepeats(sqNum, '[]')}`;
            }
            throw new Error('Unsupport Base Type.');
        });
        if (btypeStrs.length > 1) {
            return `(${btypeStrs.join(' | ')})`;
        }
        return btypeStrs[0];
    }

    private getRepeatRepeats(repeat: number, str: string) {
        if (repeat === 0) {
            return '';
        }
        let rst = '';
        for (let i = 0; i < repeat; i++) {
            rst += str;
        }
        return rst;
    }

    /**
     * 分析所有的文件，所有的scope里都构建自身闭环的类型系统
     * @param rawTypes 
     */
    private generateRawTypeMaps(rawTypes: RawTypeDef[]) {
        this._rawTypeMapping.clear();
        rawTypes.forEach((rtypeDef) => {
            if (rtypeDef.type === 'enum' || rtypeDef.type === 'struct') {
                const key = `${rtypeDef.name}$${rtypeDef.scope}`;

                if (this._rawTypeMapping.has(key)) {
                    throw new Error(`Duplicate define type ${rtypeDef.name} in package ${rtypeDef.scope}.`);
                }
                this._rawTypeMapping.set(key, rtypeDef);
            }
        });

        rawTypes.forEach((rtypeDef) => {
            if (rtypeDef.type === 'import') {
                rtypeDef.importNames.forEach((iptSingle) => {
                    const key = `${iptSingle}$${rtypeDef.scope}`;

                    if (this._rawTypeMapping.has(key)) {
                        throw new Error(`Duplicate define type ${iptSingle} in file ${rtypeDef.scope}.`);
                    }

                    const keyOrigin = `${iptSingle}$${rtypeDef.fromScope}`;
                    const rst = this._rawTypeMapping.get(keyOrigin);

                    if (!rst) {
                        throw new Error(`Cannot find the definition ${iptSingle} in file ${rtypeDef.fromScope}`);
                    }
                    this._rawTypeMapping.set(key, rst);
                });
            }
        });
    }

    public get currentSchema() {
        return this._currentSchema;
    }

    private getNoAccessoryName(type: AllTypeDesc, usingId: boolean, replacedDim?: number): string {
        if (type.descType === TypeDescType.ArrayType) {
            return `${this.getNoAccessoryName(type.baseType, usingId)}${this.getRepeatRepeats(replacedDim ? replacedDim : type.arrayDims, '[]')}`;
        } else if (type.descType === TypeDescType.MapType) {
            return `Map<${this.getNoAccessoryName(type.keyType, usingId)}, ${this.getNoAccessoryName(type.valueType, usingId)}>`;
        } else if (type.descType === TypeDescType.CombineType) {
            return `Union<${type.types.map(t => this.getNoAccessoryName(t, usingId)).join(', ')}>`;
        }
        else {
            if (usingId) return `${type.typeId}`;
            if (type.descType === TypeDescType.UserDefType) {
                return type.typeName;
            } else {
                return type.literal;
            }
        }
    }

    private _generateAccessoryType(type: IArrayTypeDesc | IMapTypeDesc | ICombineTypeDesc, currScope: string) {
        let ret: IAccessoryDesc;
        if (type.descType === TypeDescType.ArrayType) {
            const dim = type.arrayDims;
            const btype = this._getInstancedTypeId(type.baseType, currScope);
            let typeId = -1;
            for (let i = 1; i <= dim; i++) {
                const typeName = `MA_${i}_${btype}`;
                const prevType = i === 1 ? btype : this._name2Accessory.get(`MA_${i-1}_${btype}`)?.typeId;
                if (!prevType) {
                    throw new Error('Cannot trigger this.');
                }
                const noAccName = this.getNoAccessoryName(type, true, i);
                const astruct = this._name2Accessory.get(typeName);
                typeId = this._getAdditionalAccessoryTypeId(noAccName);
                if (!astruct) {
                    const sacc: IAccessoryDesc = {
                        type: 'mapArray',
                        typeId,
                        typeName: typeName,
                        byteLength: StructArray.prototype.byteLength,
                        relyTypes: [prevType],
                        scope: currScope,
                        noAccessoryName: noAccName,
                        humanReadName: this.getNoAccessoryName(type, false, i),
                    };
                    this._id2Accessory.set(typeId, sacc);
                    this._name2Accessory.set(typeName, sacc);
                } else {
                    if (astruct.scope !== currScope) {
                        astruct.scope = '';
                    }
                    typeId = astruct.typeId;
                }
            }
            return typeId;
        } else if (type.descType === TypeDescType.MapType) {
            const ktype = this._getInstancedTypeId(type.keyType, currScope);
            const vtype = this._getInstancedTypeId(type.valueType, currScope);
            const typeName = `MP_${ktype}_${vtype}`;
            const astruct = this._name2Accessory.get(typeName);
            if (astruct) {
                if (astruct.scope !== currScope) {
                    astruct.scope = '';
                }
                return astruct.typeId;
            }
            const noAccName = this.getNoAccessoryName(type, true);
            const typeId = this._getAdditionalAccessoryTypeId(noAccName);
            ret = {
                type: 'mapStruct',
                typeId,
                typeName,
                byteLength: StructMap.prototype.byteLength,
                relyTypes: [ktype, vtype],
                scope: currScope,
                noAccessoryName: noAccName,
                humanReadName: this.getNoAccessoryName(type, false),
            };
            this._id2Accessory.set(typeId, ret);
            this._name2Accessory.set(typeName, ret);
            return typeId;
        } else if (type.descType === TypeDescType.CombineType) {
            const ctypes = type.types.map((tp) => {
                return this._getInstancedTypeId(tp, currScope);
            });
            ctypes.sort();
            const typeName = `CB_${ctypes.join('_')}`;
            const astruct = this._name2Accessory.get(typeName);
            if (astruct) {
                if (astruct.scope !== currScope) {
                    astruct.scope = '';
                }
                return astruct.typeId;
            }
            const noAccName = this.getNoAccessoryName(type, true);
            const typeId = this._getAdditionalAccessoryTypeId(noAccName);
            ret = {
                type: 'combineType',
                typeId,
                typeName,
                byteLength: StructCombine.prototype.byteLength,
                relyTypes: ctypes,
                scope: currScope,
                noAccessoryName: this.getNoAccessoryName(type, true),
                humanReadName: this.getNoAccessoryName(type, false),
            };
            this._id2Accessory.set(typeId, ret);
            this._name2Accessory.set(typeName, ret);
            return typeId;
        }

        throw new Error('Unsupport accessory type.');
    }

    private _getInstancedTypeId(type: AllTypeDesc, currScope: string) {
        if (type.descType === TypeDescType.NativeSupportType || type.descType === TypeDescType.UserDefType) {
            return type.typeId;
        } else if (type.descType === TypeDescType.ArrayType || type.descType === TypeDescType.MapType || type.descType === TypeDescType.CombineType) {
            return this._generateAccessoryType(type, currScope);
        }

        throw new Error('Cannot get instanced typeId.');
    }

    /**
     * Scope and Name to RawTypeDef
     */
    private _rawTypeMapping: Map<string, EnumTypeDef | StructTypeDef> = new Map();

    private _id2Structs: Map<number, StructDescription> = new Map();
    private _name2Accessory: Map<string, IAccessoryDesc> = new Map();
    private _id2Accessory: Map<number, IAccessoryDesc> = new Map();

    private _structAnalyzed: Set<number> = new Set();

    private _idlFiles: string[];
    private _fileNameToCst: Map<string, ISMSGParserResult> = new Map();
    private _currentSchema: SMessageSchemas | undefined;
    
    /** 原来的Schema继承ID信息 */
    private _historyFile?: string;
    private _prevSchema: SMessageSchemas | undefined;
    private _scopeToPrevDefs: Map<string, (EnumDescription | StructDescription)[]> = new Map();
    private _stringToPrevAccessoryId: Map<string, IAccessoryDesc> = new Map();
    private _maxTypeId: number = MINUserDefTypeId;
    private _version: string;

    /**
     * 获取Enum和Struct的ID，如果ID在之前版本存在过，则直接使用之前的
     *
     * @private
     * @param {{ name: string; scope: string }} rawType
     * @return {number} 
     * @memberof SMessageCompiler
     */
    private _getAdditionalRawType(rawType: { name: string; scope: string }): number {
        let typeId = MINUserDefTypeId;
        const tps = this._scopeToPrevDefs.get(rawType.scope);
        if (tps) {
            const ans = tps.find((tp) => tp.typeName === rawType.name);
            if (ans) {
                typeId = ans.typeId;
            }
        }
        if (typeId === MINUserDefTypeId) {
            typeId = ++this._maxTypeId;
        }
        return typeId;
    }

    /**
     * 获取辅助结构的TypeId
     *
     * @private
     * @param {string} noAccessoryName 辅助结构的名字(以基础ID为命名基础)
     * @return {number} 新的类型
     * @memberof SMessageCompiler
     */
    private _getAdditionalAccessoryTypeId(noAccessoryName: string): number {
        let typeId = MINUserDefTypeId;
        const eid = this._stringToPrevAccessoryId.get(noAccessoryName);
        if (eid) {
            return eid.typeId;
        }
        if (typeId === MINUserDefTypeId) {
            typeId = ++this._maxTypeId;
        }
        return typeId;
    }

    /**
     * 读取历史的version，历史的生成方式将会对本次的造成影响，因为需要考虑做migration
     *
     * @private
     * @return {*} 
     * @memberof SMessageCompiler
     */
    private initPrevSchema() {
        if (!this._historyFile) {
            this._prevSchema = {
                version: '0.0.0',
                enumDefs: [],
                structDefs: [],
                accessories: [],
            };
            return;
        }
        if (fs.existsSync(this._historyFile)) {
            const stat = fs.statSync(this._historyFile);
            if (stat.isFile()) {
                try {
                    const jstr = fs.readFileSync(this._historyFile);
                    this._prevSchema = JSON.parse(jstr.toString());
                } catch (err) {
                    throw new Error('Init the prev Schema failed.');
                }
            }
        }

        if (!this._prevSchema) {
            this._prevSchema = {
                version: '0.0.0',
                enumDefs: [],
                structDefs: [],
                accessories: [],
            };
        }

        if (!isGraterOrEqualThan(this._version, this._prevSchema.version)) {
            throw new Error('Cannot generate new version not larger than prev generated.');
        }

        this._prevSchema.enumDefs.forEach((edef) => {
            let scpdeDef = this._scopeToPrevDefs.get(edef.scope);
            if (!scpdeDef) {
                scpdeDef = [];
                this._scopeToPrevDefs.set(edef.scope, scpdeDef);
            }
            scpdeDef.push(edef);
            this._maxTypeId = edef.typeId;
        });

        this._prevSchema.structDefs.forEach((tdef) => {
            let scpdeDef = this._scopeToPrevDefs.get(tdef.scope);
            if (!scpdeDef) {
                scpdeDef = [];
                this._scopeToPrevDefs.set(tdef.scope, scpdeDef);
            }
            scpdeDef.push(tdef);
            this._maxTypeId = tdef.typeId;
        });

        this._prevSchema.accessories.forEach((adef) => {
            this._stringToPrevAccessoryId.set(adef.noAccessoryName, adef);
            this._maxTypeId = adef.typeId;
        });
    }
}
