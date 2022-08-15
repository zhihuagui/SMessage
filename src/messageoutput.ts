import fs from 'fs';
import path from 'path';
import { AllTypeDesc, SMessageSchemas, TypeDescType } from './msgschema';

export class OutputGenerator {
    constructor(schema: SMessageSchemas, outDir: string, historyJson: string) {
        this._schema = schema;
        this._outDir = outDir;
        this._historyJson = historyJson;
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
        if (typeDesc.descType === TypeDescType.NativeSupportType) {}
    }

    protected _schema: SMessageSchemas;
    protected _outDir: string;
    private _historyJson: string;
}
