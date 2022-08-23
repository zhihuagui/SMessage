import path from 'path';
import { OutputGenerator } from './messageoutput';
import { EnumDescription, StringTypeId, StructDescription, TypeDescType } from './msgschema';

interface IScopeOutput {
    imports: {
        [scope: string]: Set<string>;
    };
    contents: string;
}

const literalToTypeName: {[key: string]: string} = {
    bool: 'boolean',
    int8: 'number',
    uint8: 'number',
    int16: 'number',
    uint16: 'number',
    int32: 'number',
    uint32: 'number',
    float32: 'number',
    float64: 'number',
    int64: 'number',
    uint64: 'number',
}

export class TypescriptCodeGen extends OutputGenerator {
    public override generate(): void {
        const scopeString: { [key: string]: IScopeOutput } = {};
        this.copyFile('runtime/structs.ts', 'basestructs.ts'
            , `import { messageFactory } from './msgfactory';`
            , `messageFactory.registerLoading(${StringTypeId}, StructString);`);

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

        this._generateMArrayStructs();
        this._generateFactory();
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
        return ${sdesc.byteLength};
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
     */
    private _generateMArrayStructs() {
        const outLst: string[] = [];
        this.idToDesc.forEach((desc) => {
            if (desc.type === 'multiArray') {
                const id = desc.typeId;
                const nameparts = desc.typeName.split('_');
                if (nameparts.length === 3) {
                    const dims = parseInt(nameparts[1], 10);
                    const baseTypeId = parseInt(nameparts[2], 10);
                    const structByte = this.getTypeSizeFromTypeId(baseTypeId);
                    let baseDesc = this.getTypeNameById(baseTypeId);
                    if (baseDesc in literalToTypeName) {
                        baseDesc = literalToTypeName[baseDesc];
                    }
        
                    const outStr = `
export class ${desc.typeName} extends StructMultiArray {
    public get dims() { return ${dims}; }
    public get dataBytes() { return ${structByte}; }

    public at(index: number): ${baseDesc} {
        if (index < this.size) {
            return messageFactory.create(${baseTypeId}, this._sBuffer, this.dataOffset + ${structByte} * index);
        }
        throw new Error('[Index Exceed], Get index in array error.')
    }

    public get typeId() { return ${id}; }

    static registerFactory() {
        messageFactory.registerLoading(${id}, ${desc.typeName});
    }
}
${desc.typeName}.registerFactory();
`;
                    outLst.push(outStr);
                }
            }
        });
        if (outLst.length === 0) {
            return;
        }

        const fileContents = `
import { messageFactory } from './msgfactory';
import { StructMultiArray } from './basestructs'
${outLst.join('\n')}
`;
        this.writeScopeString(fileContents, 'multiarrays', 'ts');
    }

    private _generateFactory() {
        const factoryContent = `
import type { StructBase, StructBuffer, StructString } from './basestructs';

type DerivedStructClass = {
    new (buf: ArrayBuffer | StructBuffer, offset: number) : StructBase;
}
class StructFactory {
    public registerLoading(typeId: number, cls: DerivedStructClass) {
        this._clasDefs.set(typeId, cls);
    }

${[{id: StringTypeId, cname: 'StructString'}].map(pair => `
    public create(typeId: ${pair.id}, buf: ArrayBuffer | StructBuffer, offset: number): ${pair.cname};`).join('\n')}
    public create(typeId: number, buf: ArrayBuffer | StructBuffer, offset: number): StructBase {
        const clsDef = this._clasDefs.get(typeId);
        if (!clsDef) {
            throw new Error(\`Cannot find the def of typeId: \${typeId}\`)
        }
        return new clsDef(buf, offset);
    }

    private _clasDefs: Map<number, DerivedStructClass> = new Map();
}

export const messageFactory = new StructFactory();
`
        this.writeScopeString(factoryContent, 'msgfactory', 'ts');
    }

}

