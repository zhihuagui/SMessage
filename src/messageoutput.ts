import fs from 'fs';
import path from 'path';
import { SMessageSchemas } from "./msgschema";

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
                fs.mkdirSync(odir);
            }
        }

        const fileName = path.join(odir, `${last}.${extStr}`);
        fs.writeFileSync(fileName, str);
    }

    protected _schema: SMessageSchemas;
    protected _outDir: string;
    private _historyJson: string;
}
