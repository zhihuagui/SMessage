import * as fs from 'fs';
import * as path from 'path';
import { IBaseType, IEnumDef, ISMSGParserResult, IStructDef, parseMIDL } from './parser';
import { AllTypeDesc, ICombineTypeDesc, EnumDescription, SMessageSchemas, StructDescription, TypeDescType, IMapTypeDesc, NativeSupportTypes, IUserDefTypeDesc, IArrayTypeDesc, MINUserDefTypeId } from './msgschema';
import { ICombineType as IParserCombineType } from './parser';
import { isGraterThan } from './version';

type EnumTypeDef = {
    fileName: string;
    type: 'enum';
    name: string;
    typeId: number;
    scope: string;
    cst: IEnumDef;
};

type StructTypeDef = {
    fileName: string;
    type: 'struct';
    name: string;
    typeId: number;
    scope: string;
    cst: IStructDef;
};

type ImportTypeDef = {
    fileName: string;
    type: 'import';
    importNames: string[];
    importFrom: string;
}

type RawTypeDef = EnumTypeDef | StructTypeDef | ImportTypeDef;

export class SMessageCompiler {
    constructor(rootDir: string, files: string[], currVersion: string, historyFile?: string) {
        this._rootDir = rootDir;
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
                } catch(err) {
                    console.log(`Ignore file ${fname}, due to parse error: ${err}.`);
                }
            }
        });
        this.analyseAllFiles();
    }

    private analyseAllFiles() {
        const objectDefs: RawTypeDef[] = [];

        this._fileNameToCst.forEach((cst, fname) => {
            const structs = cst.children['struct'];
            const enums = cst.children['enum'];
            const imports = cst.children['import'];
            if (enums) {
                enums.forEach((enit) => {
                    const typeName = enit.children.Literal[0].image;
                    objectDefs.push({
                        name: typeName,
                        fileName: fname,
                        type: 'enum',
                        cst: enit,
                        ...this._getAdditionalRawType({name: typeName, fileName: fname})
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
                        ...this._getAdditionalRawType({name: structName, fileName: fname})
                    });
                    stuts.children.memberDefine.forEach((memdef) => {
                        const memName = memdef.children.Literal[0].image;
                        const memStr = this.combineTypeToString(memdef.children.combineType[0]);
                        console.log(`memName: ${memName}, memtype: ${memStr}`);
                    });
                });
            }
            if (imports) {
                imports.forEach((ipt) => {
                    let fromFile = ipt.children.StringLiteral[0].image;
                    if (fromFile.length > 2) {
                        fromFile = fromFile.substring(1, fromFile.length - 1);
                    }
                    let rstFile = path.join(path.dirname(fname), fromFile);
                    if (!fs.existsSync(rstFile)) {
                        rstFile = path.join(path.dirname(fname), `${rstFile}.${path.extname(fname)}`);
                        if (!fs.existsSync(rstFile)) {
                            throw new Error(`The file ${fromFile} import from ${fname} not exist.`);
                        }
                    }
                    const imports = ipt.children.Literal.map(ipnm => ipnm.image);
                    objectDefs.push({
                        fileName: fname,
                        type: 'import',
                        importFrom: rstFile,
                        importNames: imports,
                    });
                });
            }
        });


        this.generateRawTypeMaps(objectDefs);

        const currSchema: SMessageSchemas = {
            version: this._version,
            enumDefs: [],
            structDefs: [],
        };
        objectDefs.forEach((typedef) => {
            if (typedef.type === 'enum') {
                currSchema.enumDefs.push(this._enumDefToEnumDesc(typedef));
            } else if (typedef.type === 'struct') {
                currSchema.structDefs.push(this._structDefToStructDesc(typedef));
            }
        });

        this._analyseSizeForAllStruct(currSchema);

        this._currentSchema = currSchema;
    }

    /**
     * 以4字节对齐的方式，分析并写入struct类型
     *
     * @private
     * @param {SMessageSchemas} msgs
     * @memberof SMessageCompiler
     */
    private _analyseSizeForAllStruct(msgs: SMessageSchemas) {
        const id2Types: Map<number, StructDescription | EnumDescription> = new Map();
        msgs.enumDefs.forEach(ed => {
            id2Types.set(ed.typeId, ed);
        });
        msgs.structDefs.forEach(sd => {
            id2Types.set(sd.typeId, sd);
        });

        msgs.structDefs.forEach(sd => {
            this._analyseStructDesc(sd, id2Types);
        });
    }

    private _analyseStructDesc(sDesc: StructDescription, id2Types: Map<number, StructDescription | EnumDescription>): StructDescription {
        const byteAlign = 4;
        let byteSize = 0;
        for (let i = 0; i < sDesc.members.length; i++) {
            const member = sDesc.members[i];
            const mtDesc = member.type;
            if (mtDesc.descType === TypeDescType.NativeSupportType) {
                const descByte = mtDesc.byteSize;
                byteSize = this._increaseByteWithAlign(byteSize, descByte, Math.min(byteAlign, descByte));
            } else if (mtDesc.descType === TypeDescType.MapType) {
                /** MapType memory: |Offset-4-Byte| */
                byteSize = this._increaseByteWithAlign(byteSize, 4, Math.min(byteAlign, 4));
            } else if (mtDesc.descType === TypeDescType.ArrayType) {
                /** ArrayType memory: |Offset-4-Byte| */
                byteSize = this._increaseByteWithAlign(byteSize, 4, Math.min(byteAlign, 4));
            } else if (mtDesc.descType === TypeDescType.CombineType) {
                /** CombineType memory: |Offset-4-Byte| */
                byteSize = this._increaseByteWithAlign(byteSize, 4, Math.min(byteAlign, 4));
            } else if (mtDesc.descType === TypeDescType.UserDefType) {
                const dTDesc = id2Types.get(mtDesc.typeId);
                if (dTDesc && 'size' in dTDesc) {
                    const arst = this._analyseStructDesc(dTDesc, id2Types);
                    byteSize = this._increaseByteWithAlign(byteSize, arst.size, Math.min(byteAlign, 4));
                } else if (dTDesc && 'dataType' in dTDesc) {
                    byteSize = this._increaseByteWithAlign(byteSize, dTDesc.dataType.byteSize, Math.min(byteAlign, dTDesc.dataType.byteSize));
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
        sDesc.size = byteSize;
        return sDesc;
    }

    private _increaseByteWithAlign(btSize: number, increase: number, alignSize: number) {
        const remainder = btSize % alignSize;
        if (remainder > 0) {
            return btSize + alignSize - remainder + increase;
        }
        return btSize + increase;
    }

    private _structDefToStructDesc(structDef: StructTypeDef): StructDescription {
        const ret: StructDescription = {
            typeId: structDef.typeId,
            scope: structDef.scope,
            typeName: structDef.name,
            size: 0,
            members: [],
        };
        structDef.cst.children.memberDefine.forEach((memberDef) => {
            const memberName = memberDef.children.Literal[0].image;
            const memberType = this.combineTypeToTypeDef(structDef.fileName, memberDef.children.combineType[0]);
            ret.members.push({
                name: memberName,
                type: memberType,
            });
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
            ret.valueTypes.push({name, value});
        });
        return ret;
    }

    private _getAdditionalRawType(rawType: {name: string, fileName: string}) {
        const scope = path.relative(this._rootDir, rawType.fileName);
        let typeId = MINUserDefTypeId;
        const tps = this._scopeDefs.get(scope);
        if (tps) {
            const ans = tps.find(tp => tp.typeName === rawType.name);
            if (ans) {
                typeId = ans.typeId;
            }
        }
        if (typeId === MINUserDefTypeId) {
            typeId = ++this._maxTypeId;
        }
        return { scope, typeId };
    }

    private combineTypeToTypeDef(fileName: string, combType: IParserCombineType): AllTypeDesc {
        const baseTypes = combType.children.baseType;
        if (baseTypes.length > 1) {
            const ret: ICombineTypeDesc = {
                descType: TypeDescType.CombineType,
                typeId: 63,
                types: [],
            };
            baseTypes.forEach((btype) => {
                const btypedef = this.baseTypeToTypeDef(fileName, btype);
                ret.types.push(btypedef);
            });
            return ret;
        }
        return this.baseTypeToTypeDef(fileName, baseTypes[0]);
    }

    private baseTypeToTypeDef(fileName: string, btype: IBaseType): Exclude<AllTypeDesc, ICombineTypeDesc> {
        if ('Comma' in btype.children) {
            const keyType = this.typeStringToType(fileName, btype.children.Literal[0].image);
            if (keyType.descType === TypeDescType.UserDefType) {
                throw new Error(`The UserDefined type ${btype.children.Literal[0].image} cannot use as map key.`);
            }
            const ret: IMapTypeDesc = {
                descType: TypeDescType.MapType,
                typeId: 62,
                keyType,
                valueType: this.combineTypeToTypeDef(fileName, btype.children.combineType[0]),
            };
            return ret;
        } else if ('Literal' in btype.children) {
            const sqNum = btype.children.LSquare ? btype.children.LSquare.length : 0;
            if (sqNum > 0) {
                const ret: IArrayTypeDesc = {
                    descType: TypeDescType.ArrayType,
                    typeId: 61,
                    arrayDims: sqNum,
                    baseType: this.typeStringToType(fileName, btype.children.Literal[0].image),
                };
                return ret;
            } else {
                return this.typeStringToType(fileName, btype.children.Literal[0].image);
            }
        } else if ('combineType' in btype.children) {
            const sqNum = btype.children.LSquare ? btype.children.LSquare.length : 0;
            if (sqNum > 0) {
                const ret: IArrayTypeDesc = {
                    descType: TypeDescType.ArrayType,
                    typeId: 61,
                    arrayDims: sqNum,
                    baseType: this.combineTypeToTypeDef(fileName, btype.children.combineType[0]),
                };
                return ret;
            } else {
                throw new Error(`Cannot define Combine type in combine Type.`);
            }
        }
        throw new Error(`Unsupport base type.`);
    }

    private typeStringToType(fileName: string, typeName: string) {
        const ntvType = NativeSupportTypes.find(tp => tp.literal === typeName);
        if (ntvType) {
            return ntvType;
        }
        const rawTypeKey = `${typeName}$${fileName}`;
        const rawType = this._rawTypeMapping.get(rawTypeKey);
        if (rawType) {
            const ret: IUserDefTypeDesc = {
                descType: TypeDescType.UserDefType,
                typeId: -1,
            }
            if (rawType.type === 'enum') {
                ret.typeId = rawType.typeId;
            } else if (rawType.type === 'struct') {
                ret.typeId = rawType.typeId;
            }
            if (ret.typeId < 0) {
                throw new Error(`The type: ${typeName} in file: ${fileName} is unsupoort.`);
            }
            return ret;
        }
        throw new Error(`The type: ${typeName} in file: ${fileName} is undefined.`);
    }

    private combineTypeToString(combType: IParserCombineType) {
        const baseTypes = combType.children.baseType;
        const btypeStrs = baseTypes.map((btype) => {
            if ('Comma' in btype.children) {
                const kimg = btype.children.Literal[0].image;
                const img = this.combineTypeToString(btype.children.combineType[0]);
                return `Map<${kimg}, ${img}>`;
            } else if ('Literal' in btype.children) {
                const sqNum = btype.children.LSquare ? btype.children.LSquare.length : 0;
                const img = btype.children.Literal[0].image;
                return `${img}${this.getRepeatRepeats(sqNum, '[]')}`;
            } else if ('combineType' in btype.children) {
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

    private initPrevSchema() {
        if (!this._historyFile) {
            this._prevSchema = {
                version: '0.0.0',
                enumDefs: [],
                structDefs: [],
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
        if (!isGraterThan(this._version, this._prevSchema.version)) {
            throw new Error('Cannot generate new version not larger than prev generated.');
        }


        this._prevSchema.enumDefs.forEach((edef) => {
            let scpdeDef = this._scopeDefs.get(edef.scope);
            if (!scpdeDef) {
                scpdeDef = [];
                this._scopeDefs.set(edef.scope, scpdeDef);
            }
            scpdeDef.push(edef);
            this._maxTypeId = edef.typeId;
        });

        this._prevSchema.structDefs.forEach((tdef) => {
            let scpdeDef = this._scopeDefs.get(tdef.scope);
            if (!scpdeDef) {
                scpdeDef = [];
                this._scopeDefs.set(tdef.scope, scpdeDef);
            }
            scpdeDef.push(tdef);
            this._maxTypeId = tdef.typeId;
        });
    }

    private generateRawTypeMaps(rawTypes: RawTypeDef[]) {
        this._rawTypeMapping.clear();
        rawTypes.forEach(rtypeDef => {
            if (rtypeDef.type === 'enum' || rtypeDef.type === 'struct') {
                const key = `${rtypeDef.name}$${rtypeDef.fileName}`;

                if (this._rawTypeMapping.has(key)) {
                    throw new Error(`Duplicate define type ${rtypeDef.name} in file ${rtypeDef.fileName}.`);
                }
                this._rawTypeMapping.set(key, rtypeDef);
            }
        });

        rawTypes.forEach(rtypeDef => {
            if (rtypeDef.type === 'import') {
                rtypeDef.importNames.forEach((iptSingle) => {
                    const key = `${iptSingle}$${rtypeDef.fileName}`;

                    if (this._rawTypeMapping.has(key)) {
                        throw new Error(`Duplicate define type ${iptSingle} in file ${rtypeDef.fileName}.`);
                    }

                    const keyOrigin = `${iptSingle}$${rtypeDef.importFrom}`;
                    const rst = this._rawTypeMapping.get(keyOrigin);

                    if (!rst) {
                        throw new Error(`Cannot find the definition ${iptSingle} in file ${rtypeDef.importFrom}`);
                    }
                    this._rawTypeMapping.set(key, rst);
                });
            }
        });
    }

    public get currentSchema() {
        return this._currentSchema;
    }

    private _rawTypeMapping: Map<string, RawTypeDef> = new Map();

    private _rootDir: string;
    private _version: string;
    private _idlFiles: string[];
    private _fileNameToCst: Map<string, ISMSGParserResult> = new Map();
    private _historyFile?: string;
    private _prevSchema: SMessageSchemas;
    private _currentSchema: SMessageSchemas;
    private _maxTypeId: number = MINUserDefTypeId;
    private _scopeDefs: Map<string, (EnumDescription | StructDescription)[]> = new Map();
}