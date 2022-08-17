import fs from 'fs';
import path from 'path';
import { AllTypeDesc, SMessageSchemas, NativeSupportTypes, PredefinedTypes } from './msgschema';

export interface IStructScope {
    typeId: number;
    relayTypeIds: number[];
    scopeName: string;
}

export class OutputGenerator {
    constructor(schema: SMessageSchemas, outDir: string, historyJson: string) {
        this._schema = schema;
        this._outDir = outDir;
        this._historyJson = historyJson;

        NativeSupportTypes.forEach((nst) => {
            if (this._idToDesp.has(nst.typeId)) {
                throw new Error('Duplicate typeId detected.');
            }
            this._idToDesp.set(nst.typeId, nst.byteSize);
        });

        PredefinedTypes.forEach((pdt) => {
            this._idToDesp.set(pdt.typeId, pdt.preDefinedClass.prototype.byteLength);
        });

        this._schema.enumDefs.forEach((eds) => {
            if (this._idToDesp.has(eds.typeId)) {
                throw new Error('Duplicate typeId detected.');
            }
            this._idToDesp.set(eds.typeId, eds.dataType.byteSize);
        });

        this._schema.structDefs.forEach((sds) => {
            if (this._idToDesp.has(sds.typeId)) {
                throw new Error('Duplicate typeId detected.');
            }

            this._idToDesp.set(sds.typeId, sds.size);
        });
    }

    public generate() {
        fs.writeFileSync(this._historyJson, JSON.stringify(this._schema));
    }

    protected writeScopeString(str: string, scope: string, extStr: string) {
        const subScopes = scope.split('.');
        const last = subScopes[subScopes.length - 1];

        let odir = this._outDir;
        for (let i = 0; i < subScopes.length - 1; i++) {
            odir = path.join(odir, subScopes[i]);
            const exist = fs.existsSync(odir);
            if (!exist) {
                fs.mkdirSync(odir, { recursive: true });
            }
        }

        const fileName = path.join(odir, `${last}.${extStr}`);
        fs.writeFileSync(fileName, str);
    }

    protected copyFile(srcFile: string, target: string) {
        const opath = path.join(this._outDir, target);
        const spath = path.join('src', srcFile);
        fs.copyFileSync(spath, opath);
    }

    protected getTypeSizeFromType(typeDesc: AllTypeDesc) {
        if (this._idToDesp.has(typeDesc.typeId)) {
            return this._idToDesp.get(typeDesc.typeId);
        }
        throw new Error('Cannot find the type.');
    }

    protected _schema: SMessageSchemas;
    protected _outDir: string;
    private _historyJson: string;

    private _idToDesp: Map<number, number> = new Map();
}
