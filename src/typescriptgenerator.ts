import path from 'path';
import { OutputGenerator } from './messageoutput';
import { EnumDescription, StringTypeId, StructDescription, NativeSupportTypes, TypeDescType, IAccessoryDesc, ArrayTypeId, MapTypeId, CombineTypeId, StructBaseId } from './msgschema';

const literalToNativeTypeName: {[key: string]: { tsTypeName: string; bufViewGet: string }} = {
    bool: { tsTypeName: 'boolean', bufViewGet: 'getUint8'},
    int8: { tsTypeName: 'number', bufViewGet: 'getInt8'},
    uint8: { tsTypeName: 'number', bufViewGet: 'getUint8'},
    int16: { tsTypeName: 'number', bufViewGet: 'getInt16'},
    uint16: { tsTypeName: 'number', bufViewGet: 'getUint16'},
    int32: { tsTypeName: 'number', bufViewGet: 'getInt21'},
    uint32: { tsTypeName: 'number', bufViewGet: 'getUint32'},
    float32: { tsTypeName: 'number', bufViewGet: 'getFloat32'},
    float64: { tsTypeName: 'number', bufViewGet: 'getFloat64'},
    int64: { tsTypeName: 'bitint', bufViewGet: 'getBitInt64'},
    uint64: { tsTypeName: 'bitint', bufViewGet: 'getBigUint64'},
}

interface IScopeContext {
    type: 'enum' | 'struct';
    typeId: number;
    relys: number[];
    context: string;
    scope: string;
    typeName: string;
}

interface IScopeResult {
    currentTypeIds: Set<number>;
    relyTypeIds: Set<number>;
    contextLst: IScopeContext[];
}

export class TypescriptCodeGen extends OutputGenerator {
    public override generate(): void {
        this.copyFile('runtime/structs.ts', 'basestructs.ts'
            , `import { messageFactory } from './msgfactory';`
            , `messageFactory.registerLoading(${StringTypeId}, StructString);`);

        this._idToScope.set(StructBaseId, 'basestructs');
        this._idToScope.set(StringTypeId, 'basestructs');
        this._idToScope.set(ArrayTypeId, 'basestructs');
        this._idToScope.set(MapTypeId, 'basestructs');
        this._idToScope.set(CombineTypeId, 'basestructs');

        this.schema.enumDefs.forEach((edesc) => {
            this._typeDefs.set(edesc.typeId, this._generateEnumDef(edesc));
        });

        this.schema.structDefs.forEach((sdesc) => {
            this._typeDefs.set(sdesc.typeId, this._generateStructDef(sdesc));
        });

        this.schema.accessories.forEach((access) => {
            this._typeDefs.set(access.typeId, this._generateAccessoryDef(access));
        });

        const scopeDefs: { [key: string]: IScopeContext[] } = {};
        const scopeResult: { [key: string]: IScopeResult } = {};
        this._typeDefs.forEach((sctx) => {
            if (scopeDefs[sctx.scope]) {
                scopeDefs[sctx.scope].push(sctx);
            } else {
                scopeDefs[sctx.scope] = [sctx];
            }
        });

        Object.keys(scopeDefs).forEach((scope) => {
            const defs = scopeDefs[scope];
            const curScopeIds: Set<number> = new Set();
            const relyIds: Set<number> = new Set();
            defs.forEach((def) => {
                def.relys.forEach((rid) => {
                    relyIds.add(rid);
                });
                curScopeIds.add(def.typeId);
                this._idToScope.set(def.typeId, def.scope);
            });
            curScopeIds.forEach((sid) => {
                relyIds.delete(sid);
            });
            scopeResult[scope] = {
                relyTypeIds: relyIds,
                currentTypeIds: curScopeIds,
                contextLst: defs,
            };
        });

        Object.keys(scopeResult).forEach((scope) => {
            let fileString = '';
            const rst = scopeResult[scope];
            const importFromScope: {[key: string]: Set<string>} = {};
            rst.relyTypeIds.forEach((tid) => {
                const tscope = this._idToScope.get(tid);
                if (tscope) {
                    if (importFromScope[tscope]) {
                        importFromScope[tscope].add(this.getTypeNameById(tid));
                    } else {
                        importFromScope[tscope] = new Set([this.getTypeNameById(tid)]);
                    }
                }
            });

            let hasStruct = false;
            rst.contextLst.some((sctx) => {
                if (sctx.type === 'struct') {
                    hasStruct = true;
                }
            });
            if (hasStruct) {
                importFromScope['msgfactory'] = new Set(['messageFactory']);
            }

            Object.keys(importFromScope).forEach((tscope) => {
                const currDir = scope.split('.');
                currDir.pop();
                const isplits = tscope.split('.');
                let repath = path.relative(currDir.join('/'), isplits.join('/')).replace(/\\/g, '/');
                if (!repath.startsWith('.')) {
                    repath = `./${repath}`;
                }
                fileString += `import { ${[...importFromScope[tscope]].join(', ')} } from '${repath}';\n`;
            });
            rst.contextLst.forEach((octx) => {
                fileString += octx.context;
            });
            this.writeScopeString(fileString, scope, 'ts');
        });

        this._generateFactory();
        super.generate();
    }

    private _generateEnumDef(edesc: EnumDescription): IScopeContext {
        const outStr = `
export enum ${edesc.typeName} {
${edesc.valueTypes
    .map((vt) => {
        return `    ${vt.name} = ${vt.value},`;
    })
    .join('\n')}
}
`;
        return {
            type: 'enum',
            typeName: edesc.typeName,
            relys: [],
            context: outStr,
            scope: edesc.scope,
            typeId: edesc.typeId,
        };
    }

    private _generateStructDef(sdesc: StructDescription): IScopeContext {
        const structBaseName = 'StructBase';
        const relys: Set<number> = new Set();
        let memsStr = '';
        let currOffset = 0;
        sdesc.members.forEach(((memdec) => {
            let memStr = '';
            switch (memdec.type.descType) {
            case TypeDescType.ArrayType:
                const accessoryType = memdec.type.accessory;
                if (!accessoryType) {
                    throw new Error('Must have accessory type!!!');
                }
                memStr = `
    public get ${memdec.name}() {
        if (!this.#${memdec.name}) {
            this.#${memdec.name} = messageFactory.create(${accessoryType.typeId}, this._buffer, this._offset + ${currOffset});
        }
        return this.#${memdec.name};
    }
`;
                currOffset += 12;
                memsStr += memStr;
                relys.add(memdec.type.typeId);
                break;
            case TypeDescType.MapType:
                relys.add(memdec.type.typeId);
                break;
            case TypeDescType.NativeSupportType:
                break;
            case TypeDescType.CombineType:
                break;
            case TypeDescType.UserDefType:
                relys.add(memdec.type.typeId);
                break;
            }
        }));

        const structCtx = `
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

        return {
            type: 'struct',
            typeName: sdesc.typeName,
            context: structCtx,
            scope: sdesc.scope,
            relys: [...relys, StructBaseId],
            typeId: sdesc.typeId,
        };
    }

    private _generateAccessoryDef(desc: IAccessoryDesc): IScopeContext {
        let ctxString = '';
        let scope = '';
        let brely = -1;
        if (desc.type === 'multiArray') {
            const id = desc.typeId;
            const nameparts = desc.typeName.split('_');
            if (nameparts.length === 3) {
                const dims = parseInt(nameparts[1], 10);
                const baseTypeId = parseInt(nameparts[2], 10);
                const structByte = this.getTypeSizeFromTypeId(baseTypeId);
                let baseDesc = this.getTypeNameById(baseTypeId);
                if (baseDesc in literalToNativeTypeName) {
                    baseDesc = literalToNativeTypeName[baseDesc].tsTypeName;
                }
                brely = ArrayTypeId;

                ctxString = `
export class ${desc.typeName} extends StructMultiArray {
    public get dims() { return ${dims}; }
    public get dataBytes() { return ${structByte}; }

    public at(index: number): ${baseDesc} {
        if (index < this.size) {
            return ${this._getValueFromId(baseTypeId, `this.dataOffset + ${structByte} * index`)};
        }
        throw new Error('[Index Exceed], Get index in array error.')
    }

    public get typeId() { return ${id}; }

}
messageFactory.registerLoading(${id}, ${desc.typeName});
`;
                scope = 'multiarrays';
            }
        } else if (desc.type === 'mapStruct') {
            const id = desc.typeId;
            const nameparts = desc.typeName.split('_');
            if (nameparts.length !== 3) {
                throw new Error('Map must have 3 parts.');
            }
            const keyTypeId = parseInt(nameparts[1]);
            const valueTypeId = parseInt(nameparts[2]);
            const structByte = this.getTypeSizeFromTypeId(valueTypeId);
            let baseDesc = this.getTypeNameById(valueTypeId);
            if (baseDesc in literalToNativeTypeName) {
                baseDesc = literalToNativeTypeName[baseDesc].tsTypeName;
            }
            let getValueStr = '';
            if (keyTypeId === StringTypeId) {
                getValueStr = `    public get(type: string): ${baseDesc} {
        const offset = this.getStringOffset();
        return ${this._getValueFromId(valueTypeId, 'offset')};
    }`;
            } else {
                getValueStr = `    public get(type: number): ${baseDesc} {
        const offset = this.getNumberOffset();
        return ${this._getValueFromId(valueTypeId, 'offset')};
    }`;
            }

            brely = MapTypeId;
            const mapCtx = `
export class ${desc.typeName} extends StructMap {
    public get dataBytes() {
        return ${structByte};
    }

    public get typeId() {
        return ${id};
    }

${getValueStr}

}`;
            scope = 'mapstructs';
            ctxString = mapCtx;
        } else if (desc.type === 'combineType') {
            const nameparts = desc.typeName.split('_');
            const candidateTypes = nameparts.slice(1);
            brely = CombineTypeId;
            ctxString = `
export class ${desc.typeName} extends StructCombine {
    public get typeId() {
        return ${desc.typeId};
    }

    public get totalIndex() {
        return ${candidateTypes.length};
    }

    public getValue() {
        switch(this._sBuffer._dataView.getUint8(this._offset)) {
${candidateTypes.map((tyStr, index) => {
    const typeId = parseInt(tyStr);
    return `            case ${index + 1}:
                return ${this._getValueFromId(typeId, `this.`)};`;
}).join('\n')}
            default:
                throw new Error('Unexpect combine typeId.');
        }
    }
}`;
            scope = 'combinestructs';

        }
        return {
            type: 'struct',
            typeName: desc.typeName,
            scope: scope,
            relys: [brely, ...desc.relyTypes],
            context: ctxString,
            typeId: desc.typeId,
        };
    }

    private _generateFactory() {
        const importFromScope: {[key: string]: Set<string>} = {};
        const itCNames: { id: number; cname: string }[] = [{id: StringTypeId, cname: 'StructString'}];
        this._typeDefs.forEach((tdef, tid) => {
            if (this.idToDesc.get(tid)?.type === 'enum') {
                return;
            }

            itCNames.push({ id: tid, cname: tdef.typeName });
            const tscope = this._idToScope.get(tid);
            if (tscope) {
                if (importFromScope[tscope]) {
                    importFromScope[tscope].add(this.getTypeNameById(tid));
                } else {
                    importFromScope[tscope] = new Set([this.getTypeNameById(tid)]);
                }
            }
        });

        let importStr = '';
        Object.keys(importFromScope).forEach((tscope) => {
            const isplits = tscope.split('.');
            let repath = path.relative('.', isplits.join('/')).replace(/\\/g, '/');
            if (!repath.startsWith('.')) {
                repath = `./${repath}`;
            }
            importStr += `import type { ${[...importFromScope[tscope]].join(', ')} } from '${repath}';\n`;
        });

        const factoryContent = `
import type { StructBase, StructBuffer, StructString } from './basestructs';
${importStr}
type DerivedStructClass = {
    new (buf: ArrayBuffer | StructBuffer, offset: number) : StructBase;
}
class StructFactory {
    public registerLoading(typeId: number, cls: DerivedStructClass) {
        this._clasDefs[typeId] = cls;
    }

${itCNames.map(pair => `
    public create(typeId: ${pair.id}, buf: ArrayBuffer | StructBuffer, offset: number): ${pair.cname};`).join('')}
    public create(typeId: number, buf: ArrayBuffer | StructBuffer, offset: number): StructBase {
        const clsDef = this._clasDefs[typeId];
        if (!clsDef) {
            throw new Error(\`Cannot find the def of typeId: \${typeId}\`)
        }
        return new clsDef(buf, offset);
    }

    private _clasDefs: DerivedStructClass[] = [];
}

export const messageFactory = new StructFactory();
`
        this.writeScopeString(factoryContent, 'msgfactory', 'ts');
    }

    private _getValueFromId(typeId: number, offsetStr: string) {
        const nativeST = NativeSupportTypes.find((tp) => {
            return tp.typeId === typeId;
        });
        if (nativeST) {
            if (nativeST.literal in literalToNativeTypeName) {
                if ('bool' === nativeST.literal) {
                    return `this._sBuffer._dataView.${literalToNativeTypeName[nativeST.literal].bufViewGet}(${offsetStr}) !== 0;`;
                } else if ('int8' === nativeST.literal || 'uint8' === nativeST.literal) {
                    return `this._sBuffer._dataView.${literalToNativeTypeName[nativeST.literal].bufViewGet}(${offsetStr});`;
                } else {
                    return `this._sBuffer._dataView.${literalToNativeTypeName[nativeST.literal].bufViewGet}(${offsetStr}, true);`;
                }
            }
        }
        return `messageFactory.create(${typeId}, this._sBuffer, ${offsetStr});`
    }

    private _typeDefs: Map<number, IScopeContext> = new Map();
    private _idToScope: Map<number, string> = new Map();
}

