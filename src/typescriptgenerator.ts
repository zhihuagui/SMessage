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

        this.schema.enumDefs.forEach((edesc) => {
            const enumStr = this._generateEnumDef(edesc);
            if (!scopeString[edesc.scope]) {
                scopeString[edesc.scope] = {imports : {}, contents: ''};
            }
            scopeString[edesc.scope].contents += enumStr;
        });

        this.schema.structDefs.forEach((sdesc) => {
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

    private analyseDependence() {
        // 分析出先初始化哪些struct
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
                const mulAName = `MA_${memdec.type.arrayDims}_${this.getTypeSizeFromTypeId(memdec.type.baseType.typeId)}`;
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

    public buildSelf() {
    }
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
            const baseTypeId = parseInt(nameparts[2], 10);
            const structByte = this.getTypeSizeFromTypeId(baseTypeId);
            const baseDesc = this.getDescByTypeId(baseTypeId);

            const outStr = `
export class ${name} extends StructMultiArray {
    public get dims() { return ${dims}; }
    public get dataBytes() { return ${structByte}; }

    public at(index: number): ${baseDesc.typeName} {
        if (index < this.size) {
            return Factory.create(${baseTypeId});
        }
        return undefined;
    }

    static registerFactory() {
    }
}
`;
            return outStr;
        }
    }

}

import type { StructBase, StructBuffer, StructString } from './runtime/structs';

type DerivedStructClass = {
    new (buf: ArrayBuffer | StructBuffer, offset: number) : StructBase;
}
export class StructFactory {
    public registerLoading(typeId: number, cls: DerivedStructClass) {
        this._clasDefs.set(typeId, cls);
    }

    public create(typeId: 12, buf: ArrayBuffer | StructBuffer, offset: number): StructString;
    public create(typeId: number, buf: ArrayBuffer | StructBuffer, offset: number): StructBase {
        const clsDef = this._clasDefs.get(typeId);
        if (!clsDef) {
            throw new Error(`Cannot find the def of typeId: ${typeId}`)
        }
        return new clsDef(buf, offset);
    }

    private _clasDefs: Map<number, DerivedStructClass> = new Map();
}
