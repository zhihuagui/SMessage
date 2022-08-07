import fs from 'fs';
import { OutputGenerator } from './messageoutput';

export class TypescriptCodeGen extends OutputGenerator {

    public override generate(): void {
        const scopeString: {[key: string]: string} = {};

        this._schema.enumDefs.forEach((edesc) => {
            const outStr = `
export enum ${edesc.typeName} {
${edesc.valueTypes.map(vt => {
    return `    ${vt.name} = ${vt.value},`;
}).join('\n')}
}
            `;
            if (scopeString[edesc.scope]) {
                scopeString[edesc.scope] += outStr;
            } else {
                scopeString[edesc.scope] = outStr;
            }
        });

        Object.keys(scopeString).forEach(scope => {
            this.writeScopeString(scopeString[scope], scope, 'ts');
        });

        super.generate();
    }

}
