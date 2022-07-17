import { ISMSGParserResult, parseMIDL } from './parser';
import * as fs from 'fs';
import { SMessageSchemas } from './msgschema';
import { ICombineType } from './parser';

export class SMessageCompiler {
    constructor(files: string[], historyFile?: string) {
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
        const objectDefs: {fileName: string; type: 'enum' | 'struct'; name: string}[] = [];

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
                    });
                    stuts.children.memberDefine.forEach((memdef) => {
                        const memName = memdef.children.Literal[0].image;
                        const memStr = this.combineTypeToString(memdef.children.combineType[0]);
                        console.log(`memName: ${memName}, memtype: ${memStr}`);
                    });
                });
            }
        });
    }

    private combineTypeToString(combType: ICombineType) {
        const baseTypes = combType.children.baseType;
        const btypeStrs = baseTypes.map((btype) => {
            if ('Literal' in btype.children) {
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
    }

    private _idlFiles: string[];
    private _fileNameToCst: Map<string, ISMSGParserResult> = new Map();
    private _historyFile?: string;
    private _prevSchema: SMessageSchemas;
    private _currentSchema: SMessageSchemas;
}