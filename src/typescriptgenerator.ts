import fs from 'fs';
import { SMessageSchemas } from "./msgschema";

export class TypescriptCodeGen {
    constructor(schema: SMessageSchemas, dir: string) {
        this._schema = schema;
        this._outDir = dir;
    }

    public generateOutputs() {
        this._schema.enumDefs.forEach((edesc) => {
            const outStr = `
export interface ${edesc.typeName} {
${edesc.valueTypes.map(vt => {
    return `    ${vt.name} = ${vt.value},`;
}).join('\n')}
}
            `;
            console.log(outStr);
        });
    }

    private _schema: SMessageSchemas;
    private _outDir: string;
}
