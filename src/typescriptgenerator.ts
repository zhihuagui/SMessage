import path from 'path';
import { OutputGenerator } from './messageoutput';
import { EnumDescription, StructDescription, TypeDescType } from './msgschema';

interface IScopeOutput {
    imports: {
        [scope: string]: Set<string>;
    };
    contents: string;
}

export class TypescriptCodeGen extends OutputGenerator {
    public override generate(): void {
        const scopeString: { [key: string]: IScopeOutput } = {};
        this.copyFile('runtime/structs.ts', 'basestructs.ts');

        this._schema.enumDefs.forEach((edesc) => {
            const enumStr = this._generateEnumDef(edesc);
            if (!scopeString[edesc.scope]) {
                scopeString[edesc.scope] = {imports : {}, contents: ''};
            }
            scopeString[edesc.scope].contents += enumStr;
        });

        this._schema.structDefs.forEach((sdesc) => {
            const scope = sdesc.scope;
            if (!scopeString[scope]) {
                scopeString[scope] = {imports : {}, contents: ''};
            }
            scopeString[scope].contents += this._generateStructDef(sdesc, scopeString[scope]);
        });

        Object.keys(scopeString).forEach((scope) => {
            const currDir = scope.split('.');
            currDir.pop();
            const imports = scopeString[scope].imports;
            let importStr = '';
            Object.keys(imports).forEach((iscpe) => {
                /* 基础的struct定义在..的scope内,文件名base */
                if (iscpe === '..') {
                    const repath = path.relative(currDir.join('/'), 'basestructs').replace(/\\/g, '/');
                    importStr += `import {${[...imports[iscpe]].join(', ')}} from '${repath}';\n`;
                } else {
                    const isplits = iscpe.split('.');
                    const repath = path.relative(currDir.join('/'), isplits.join('/')).replace(/\\/g, '/');
                    importStr += `import {${[...imports[iscpe]].join(', ')}} from '${repath}';\n`;
                }
            });
            this.writeScopeString(importStr + scopeString[scope].contents, scope, 'ts');
        });

        super.generate();
    }

    private _generateEnumDef(edesc: EnumDescription) {
        const outStr = `
export enum ${edesc.typeName} {
${edesc.valueTypes
    .map((vt) => {
        return `    ${vt.name} = ${vt.value},`;
    })
    .join('\n')}
}
`;
        return outStr;
    }

    private _generateStructDef(sdesc: StructDescription, scopeOut: IScopeOutput) {
        const structBaseName = 'StructBase';
        const structArrayName = 'StructMultiArray';
        const structMapName = 'StructMap';
        if (!scopeOut.imports['..']) {
            scopeOut.imports['..'] = new Set();
        }

        scopeOut.imports['..'].add(structBaseName);

        let memsStr = '';
        let currOffset = 0;
        sdesc.members.forEach(((memdec) => {
            let memStr = '';
            switch (memdec.type.descType) {
            case TypeDescType.ArrayType:
                const mulAName = `StructMultiArray${memdec.type.arrayDims}_${this.getTypeSizeFromType(memdec.type.baseType)}`;
                scopeOut.imports['..'].add(structArrayName);
                memStr = `
    public get ${memdec.name}() {
        if (!this.#${memdec.name}) {
            this.#${memdec.name} = new ${mulAName}(this._buffer, this._offset + ${currOffset});
        }
        return this.#${memdec.name};
    }
`;
                currOffset += 12;
                memsStr += memStr;
                break;
            case TypeDescType.MapType:
                scopeOut.imports['..'].add(structMapName);
                break;
            case TypeDescType.NativeSupportType:
                break;
            case TypeDescType.CombineType:
                break;
            case TypeDescType.UserDefType:
                
                break;
            }
        }));

        const outStr = `
export class ${sdesc.typeName} extends ${structBaseName} {
    ${memsStr}

    public get typeId() {
        return ${sdesc.typeId};
    }

    public get byteLength() {
        return ${sdesc.size};
    }

    public gcStruct() {}
}
        `;

        return outStr;
    }

    /**
     * Generate the array define.
     * @param name StructMultiArray name, StructMultiArray_${Dims}_${StructByte}
     */
    private _generateStructMArray(name: string) {
        const nameparts = name.split('_');
        if (nameparts.length === 3) {
            const dims = parseInt(nameparts[1], 10);
            const stryctByte = parseInt(nameparts[2], 10);

            const outStr = `
export class ${name} extends StructMultiArray {geometry library c++
    public get dims() { return ${dims}; }
    public get dataBytes() { return ${stryctByte}; }
}
`;
            return outStr;
        }
    }


}
