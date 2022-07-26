import fs from 'fs';
import { SMessageSchemas } from "./msgschema";

export class MessageOutput {
    constructor(schema: SMessageSchemas) {
        this._schema = schema;
    }

    public generate(dir: string) {
        if (fs.existsSync(dir)) {
            this._schema.enumDefs;
        }
    }

    private _schema: SMessageSchemas;
}