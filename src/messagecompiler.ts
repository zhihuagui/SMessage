import * as fs from 'fs';
import * as path from 'path';
import { IEnumDef, ISMSGParserResult, IStructDef, parseMIDL } from './parser';
import { EnumDescription, SMessageSchemas, TypeDescription } from './msgschema';
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

type RawTypeDef = EnumTypeDef | StructTypeDef;

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
        });

        const retJson: SMessageSchemas = {
            version: this._version,
            enumDefs: [],
            typeDefs: [],
        };
        objectDefs.forEach((typedef) => {
            if (typedef.type === 'enum') {
                retJson.enumDefs.push(this._enumDefToEnumDesc(typedef));
            }
        });

        return retJson;
    }

    private _enumDefToEnumDesc(enumDef: EnumTypeDef): EnumDescription {
        let dataType = 'int32';
        if (enumDef.cst.children.enumDataType) {
            dataType = enumDef.cst.children.enumDataType[0].children.Literal[0].image;
        }
        const ret: EnumDescription = {
            typeDescId: enumDef.typeId,
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
        let typeId = 0;
        const tps = this._scopeDefs.get(scope);
        if (tps) {
            const ans = tps.find(tp => tp.typeName === rawType.name);
            if (ans) {
                typeId = ans.typeDescId;
            }
        }
        if (typeId === 0) {
            typeId = ++this._maxTypeId;
        }
        return { scope, typeId };
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
                typeDefs: [],
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
            this._maxTypeId = edef.typeDescId;
        });

        this._prevSchema.typeDefs.forEach((tdef) => {
            let scpdeDef = this._scopeDefs.get(tdef.scope);
            if (!scpdeDef) {
                scpdeDef = [];
                this._scopeDefs.set(tdef.scope, scpdeDef);
            }
            scpdeDef.push(tdef);
            this._maxTypeId = tdef.typeDescId;
        });
    }


    private _rootDir: string;
    private _version: string;
    private _idlFiles: string[];
    private _fileNameToCst: Map<string, ISMSGParserResult> = new Map();
    private _historyFile?: string;
    private _prevSchema: SMessageSchemas;
    private _currentSchema: SMessageSchemas;
    private _maxTypeId: number = 0;
    private _scopeDefs: Map<string, (EnumDescription | TypeDescription)[]> = new Map();
}