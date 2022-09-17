import path from 'path';
import { OutputGenerator } from './messageoutput';
import { EnumDescription, StringTypeId, StructDescription, NativeSupportTypes, TypeDescType, IAccessoryDesc, ArrayTypeId, MapTypeId, CombineTypeId, StructBaseId, EMemberRefType } from './msgschema';

interface NativeTypeGenDesc {
    [key: string]: { tsTypeName: string; bufViewGet: string; bufViewSet: string };
}
const literalToNativeTypeName: NativeTypeGenDesc = {
    bool: { tsTypeName: 'boolean', bufViewGet: 'getUint8', bufViewSet: 'setUint8'},
    int8: { tsTypeName: 'number', bufViewGet: 'getInt8', bufViewSet: 'setInt8'},
    uint8: { tsTypeName: 'number', bufViewGet: 'getUint8', bufViewSet: 'setUint8'},
    int16: { tsTypeName: 'number', bufViewGet: 'getInt16', bufViewSet: 'setInt16'},
    uint16: { tsTypeName: 'number', bufViewGet: 'getUint16', bufViewSet: 'setUint16'},
    int32: { tsTypeName: 'number', bufViewGet: 'getInt32', bufViewSet: 'setInt32'},
    uint32: { tsTypeName: 'number', bufViewGet: 'getUint32', bufViewSet: 'setUint32'},
    float32: { tsTypeName: 'number', bufViewGet: 'getFloat32', bufViewSet: 'setFloat32'},
    float64: { tsTypeName: 'number', bufViewGet: 'getFloat64', bufViewSet: 'setFloat64'},
    int64: { tsTypeName: 'bitint', bufViewGet: 'getBitInt64', bufViewSet: 'setBitInt64'},
    uint64: { tsTypeName: 'bitint', bufViewGet: 'getBigUint64', bufViewSet: 'setBigUint64'},
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
                        importFromScope[tscope].add(this.getSchemaTypeNameById(tid));
                    } else {
                        importFromScope[tscope] = new Set([this.getSchemaTypeNameById(tid)]);
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
        sdesc.members.forEach(((memdec) => {
            switch (memdec.type.descType) {
            case TypeDescType.ArrayType:
            {
                const accessoryType = memdec.type.accessory;
                if (!accessoryType) {
                    throw new Error('Must have accessory type!!!');
                }
                memsStr += `
    #${memdec.name}: ${this._getMSGTSName(accessoryType.typeId)} | undefined;

    public get ${memdec.name}() {
        if (!this.#${memdec.name}) {
            this.#${memdec.name} = messageFactory.create(${accessoryType.typeId}, this._buffer, this._offset + ${memdec.offset});
        }
        return this.#${memdec.name};
    }
`;
                relys.add(accessoryType.typeId);
                break;
            }
            case TypeDescType.MapType:
            {
                const accessoryType = memdec.type.accessory;
                if (!accessoryType) {
                    throw new Error('Must have accessory type!!!');
                }
                memsStr += `
    #${memdec.name}: ${this._getMSGTSName(accessoryType.typeId)} | undefined;
    public get ${memdec.name}() {
        if (!this.#${memdec.name}) {
            this.#${memdec.name} = messageFactory.create(${accessoryType.typeId}, this._buffer, this._offset + ${memdec.offset});
        }
        return this.#${memdec.name};
    }
`;
                relys.add(accessoryType.typeId);
                break;
            }
            case TypeDescType.NativeSupportType:
                memsStr += `
    public get ${memdec.name}() {
        return ${this._getValueFromId(memdec.type.typeId, `${memdec.offset}`)};
    }

    public set ${memdec.name}(value: ${this._getGeneralTSName(memdec.type.typeId)}) {
        ${this._setValueForId(memdec.type.typeId, `${memdec.offset}`, 'value')};
    }
`;
                break;
            case TypeDescType.CombineType:
            {
                const accessoryType = memdec.type.accessory;
                if (!accessoryType) {
                    throw new Error('Must have accessory type!!!');
                }
                memsStr += `
    #${memdec.name}: ${this._getMSGTSName(accessoryType.typeId)} | undefined;
    public get ${memdec.name}() {
        if (!this.#${memdec.name}) {
            this.#${memdec.name} = messageFactory.create(${accessoryType.typeId}, this._buffer, this._offset + ${memdec.offset});
        }
        return this.#${memdec.name};
    }
`;
                relys.add(accessoryType.typeId);
                break;
            }
            case TypeDescType.UserDefType:
            {
                const memType = this.idToDesc.get(memdec.type.typeId);
                if (memType && memType.type === 'struct') {
                    let gstr = ``;
                    if (memdec.refType === EMemberRefType.reference) {
                        gstr = `const addr = this._dataView.getInt32(this._offset + ${memdec.offset}, true);
            if (!addr) {
                return undefined;
            }
            this.#${memdec.name} = messageFactory.create(${memType.typeId}, this._buffer, addr);`;
                    } else if (memdec.refType === EMemberRefType.inline) {
                        gstr = `this.#${memdec.name} = messageFactory.create(${memType.typeId}, this._buffer, this._offset + ${memdec.offset});`;
                    }
                    memsStr += `
    #${memdec.name}: ${this._getMSGTSName(memType.typeId)} | undefined;
    public get ${memdec.name}()${memdec.refType === EMemberRefType.reference ? `: ${this._getMSGTSName(memType.typeId)} | undefined` : `: ${this._getMSGTSName(memType.typeId)}`} {
        if (!this.#${memdec.name}) {
            ${gstr}
        }
        return this.#${memdec.name};
    }
`;
                }
                break;
            }
            }
        }));

        const structCtx = `
export class ${sdesc.typeName} extends ${structBaseName} {
    public static typeId(): ${sdesc.typeId} {
        return ${sdesc.typeId};
    }

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
messageFactory.registerLoading(${sdesc.typeId}, ${sdesc.typeName});
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
        if (desc.type === 'mapArray') {
            const id = desc.typeId;
            const nameparts = desc.typeName.split('_');
            if (nameparts.length === 3) {
                const dims = parseInt(nameparts[1], 10);
                const baseTypeId = desc.relyTypes.length === 1 ? desc.relyTypes[0] : parseInt(nameparts[2], 10);
                const structByte = this.getTypeSizeFromTypeId(baseTypeId);
                const baseDesc = this._getMSGTSName(baseTypeId);
                brely = ArrayTypeId;

                ctxString = `
export class ${desc.typeName} extends StructArray {
    public static humanReadableName(): '${desc.humanReadName}' {
        return '${desc.humanReadName}';
    }
    public get dims() { return ${dims}; }
    public get dataBytes() { return ${structByte}; }

    public at(index: number): ${baseDesc} {
        if (index < this.size) {
            if (this._c[index]) {
                return this._c[index];
            }
            const value = ${this._getValueFromId(baseTypeId, `this.dataOffset + ${structByte} * index`)};
            this._c[index] = value;
            return value;
        }
        throw new Error('[Index Exceed], Get index in array error.')
    }

    public get typeId() { return ${id}; }
    private _c: ${baseDesc}[] = [];
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
            const keyByte = this.getTypeSizeFromTypeId(keyTypeId);
            const kSchemaTypeName = this.getSchemaTypeNameById(keyTypeId);
            const kGTSTypeName = this._getGeneralTSName(keyTypeId);
            const valueByte = this.getTypeSizeFromTypeId(valueTypeId);
            const baseDesc = this._getMSGTSName(valueTypeId);
            let getValueStr = '';
            if (keyTypeId === StringTypeId) {
                getValueStr = `    public get(key: string): ${baseDesc} | undefined {
        const offset = this.binSearchLocation(key);
        if (!offset) {
            return undefined;
        }
        return ${this._getValueFromId(valueTypeId, 'offset')};
    }`;
            } else {
                getValueStr = `    public get(key: number): ${baseDesc} | undefined {
        const offset = this.binSearchLocation(key);
        if (!offset) {
            return undefined;
        }
        return ${this._getValueFromId(valueTypeId, 'offset')};
    }`;
            }

            let searchMethod: string;
            if (kGTSTypeName === 'number' || kGTSTypeName === 'string') {
                searchMethod = this._generateBinSearch(kGTSTypeName, kSchemaTypeName);
            } else {
                throw new Error('Ts Key type only support string or number.');
            }

            brely = MapTypeId;
            const mapCtx = `
export class ${desc.typeName} extends StructMap {
    public static humanReadableName(): '${desc.humanReadName}' {
        return '${desc.humanReadName}';
    }

    public get typeId(): number {
        return ${id};
    }

    public get keyByte(): number {
        return ${keyByte};
    }

    public get valueByte() {
        return ${valueByte};
    }

${searchMethod}

${getValueStr}

}
messageFactory.registerLoading(${id}, ${desc.typeName});

`;
            scope = 'mapstructs';
            ctxString = mapCtx;
        } else if (desc.type === 'combineType') {
            const nameparts = desc.typeName.split('_');
            const candidateTypes = nameparts.slice(1);
            brely = CombineTypeId;
            ctxString = `
export class ${desc.typeName} extends StructCombine {
    public static humanReadableName(): '${desc.humanReadName}' {
        return '${desc.humanReadName}';
    }

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
    const tpSize = this.getTypeSizeFromTypeId(typeId);
    if (!tpSize) {
        throw new Error('Must should be found size.');
    }
    const offsetStr = tpSize <= 4 ? 'this._offset + 4' : 'this._sBuffer._dataView.getInt32(this._offset + 4, true)';
    return `            case ${index + 1}:
                return ${this._getValueFromId(typeId, offsetStr)};`;
}).join('\n')}
            default:
                throw new Error('Unexpect combine typeId.');
        }
    }

${candidateTypes.map((tpStr, index) => {
    const typeId = parseInt(tpStr);
    const tpName = this.getSchemaTypeNameById(typeId);
    const upperFirstName = tpName.charAt(0)?.toUpperCase() + tpName.slice(1);
    const tsTpName = tpName in literalToNativeTypeName ? literalToNativeTypeName[tpName].tsTypeName : tpName;
    const tpSize = this.getTypeSizeFromTypeId(typeId);
    let offsetStr: string;
    let setStr: string;
    if (tpSize && tpSize <= 4) {
        offsetStr = 'this._offset + 4';
        setStr = this._setValueForId(typeId, 'this._offset + 4', 'value');
    } else {
        setStr = `const bufAddr = this.createSubBuffer(${tpSize});
        this._sBuffer._dataView.setInt32(this._offset + 4, bufAddr);
        ${this._setValueForId(typeId, 'bufAddr', 'value')}`;
        offsetStr = 'this._sBuffer._dataView.getInt32(this._offset + 4, true)';
    }
    return `    public set${upperFirstName}(value: ${tsTpName}) {
        this._sBuffer._dataView.setUint8(this._offset, ${index});
        ${setStr};
    }
    public is${upperFirstName}() {
        return this._sBuffer._dataView.getUint8(this._offset) === ${index};
    }
    public get${upperFirstName}() {
        return ${this._getValueFromId(typeId, offsetStr)};
    }`;
}).join('\n')}
}
messageFactory.registerLoading(${desc.typeId}, ${desc.typeName});

`;
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
                    importFromScope[tscope].add(this.getSchemaTypeNameById(tid));
                } else {
                    importFromScope[tscope] = new Set([this.getSchemaTypeNameById(tid)]);
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
                    return `this._sBuffer._dataView.${literalToNativeTypeName[nativeST.literal].bufViewGet}(${offsetStr}) !== 0`;
                } else if ('int8' === nativeST.literal || 'uint8' === nativeST.literal) {
                    return `this._sBuffer._dataView.${literalToNativeTypeName[nativeST.literal].bufViewGet}(${offsetStr})`;
                } else {
                    return `this._sBuffer._dataView.${literalToNativeTypeName[nativeST.literal].bufViewGet}(${offsetStr}, true)`;
                }
            }
        }
        return `messageFactory.create(${typeId}, this._sBuffer, ${offsetStr})`
    }

    private _setValueForId(typeId: number, offsetStr: string, valueStr: string) {
        const nativeST = NativeSupportTypes.find((tp) => {
            return tp.typeId === typeId;
        });
        if (nativeST) {
            if (nativeST.literal in literalToNativeTypeName) {
                if ('bool' === nativeST.literal) {
                    return `this._sBuffer._dataView.${literalToNativeTypeName[nativeST.literal].bufViewSet}(${offsetStr}, ${valueStr} ? 1 : 0)`;
                } else if ('int8' === nativeST.literal || 'uint8' === nativeST.literal) {
                    return `this._sBuffer._dataView.${literalToNativeTypeName[nativeST.literal].bufViewSet}(${offsetStr}, ${valueStr})`;
                } else {
                    return `this._sBuffer._dataView.${literalToNativeTypeName[nativeST.literal].bufViewSet}(${offsetStr}, ${valueStr}, true)`;
                }
            }
        }
        return `const tmp = messageFactory.create(${typeId}, this._sBuffer, ${offsetStr}); ${valueStr}.copyToBuffer(this._sBuffer, ${offsetStr})`;
    }

    private _generateBinSearch(tsType: 'number' | 'string', schemaTypeName: string) {
        if (tsType === 'number') {
            const desc = literalToNativeTypeName[schemaTypeName];
            return `
    private compareKey(keyValue: number, localAddr: number) {
        const local = this._sBuffer._dataview.${desc.bufViewGet}(localAddr${['uint8', 'int8'].includes(schemaTypeName) ? '' : ', true'});
        if (key < local) { return 1; }
        else if (key > local) { return -1; }
        return 0;
    }

    private binSearchLocation(key: number) {
        let mk = 0;
        let mx = this.size;
        while(mx - mk > 1) {
            const nxt = Math.floor((mx - mk) / 2);
            const compareOffset = dataOffset + nxt * (12 + this.valueByte);
            const rst = this.compareKey(key, compareOffset);
            if (rst === 0) {
                return compareOffset;
            } else if (rst < 0) {
                mx = nxt - 1;
            } else {
                mk = nxt + 1;
            }
        }
        let compareOffset = dataOffset + mx * (this.keyByte + this.valueByte);
        let rst = this.compareKey(key, compareOffset);
        if (rst === 0) {
            return compareOffset;
        }
        if (mk == mx) {
            return undefined;
        }
        compareOffset -= this.keyByte + this.valueByte;
        rst = this.compareKey(key, compareOffset);
        if (rst === 0) {
            return compareOffset;
        }
        return undefined;
    }
`;
        } else if (tsType === 'string') {
            return `
    private compareKey(keyBuffer: Uint8Array, localAddr: number) {
        let localBuffer: Uint8Array;
        const dataOffset = this._dataView.getInt32(localAddr, true);
        if (dataOffset > 0) {
            const len = this._dataView.getInt32(localAddr + 4, true);
            localBuffer = new Uint8Array(this._buffer, dataOffset, len);
        } else {
            const len = this._dataView.getInt8(localAddr) & 0x7F;
            localBuffer = new Uint8Array(this._buffer, localAddr + 1, len);
        }

        const compareLen = Math.min(keyBuffer.length, localBuffer.length);
        for (let i = 0; i < compareLen; i++) {
            if (keyBuffer[i] < localBuffer[i]) {
                return 1;
            } else if (keyBuffer[i] > localBuffer[i]) {
                return -1;
            }
        }
        if (keyBuffer.length < localBuffer.length) {
            return 1;
        } else if (keyBuffer.length > localBuffer.length) {
            return -1;
        }
        return 0;
    }

    private binSearchLocation(key: string) {
        const dataOffset = this.dataOffset;
        const keyBuffer = this.toUint8Array(key);
        let mk = 0;
        let mx = this.size;
        while(mx - mk > 1) {
            const nxt = Math.floor((mx - mk) / 2);
            const compareOffset = dataOffset + nxt * (12 + this.valueByte);
            const rst = this.compareKey(keyBuffer, compareOffset);
            if (rst === 0) {
                return compareOffset;
            } else if (rst < 0) {
                mx = nxt - 1;
            } else {
                mk = nxt + 1;
            }
        }

        let compareOffset = dataOffset + mx * (12 + this.valueByte);
        let rst = this.compareKey(keyBuffer, compareOffset);
        if (rst === 0) {
            return compareOffset;
        }
        if (mk == mx) {
            return undefined;
        }
        compareOffset -= 12 + this.valueByte;
        rst = this.compareKey(keyBuffer, compareOffset);
        if (rst === 0) {
            return compareOffset;
        }
        return undefined;
    }
`;
        }

        throw new Error('error.');
    }

    /**
     * 将id转换到TS类型，主要为了往MSG中写入数据
     * @param id 类型的ID
     * @returns Typescript中的输入性类型
     */
    private _getGeneralTSName(id: number) {
        const name = this.getSchemaTypeNameById(id);
        if (name in literalToNativeTypeName) {
            return literalToNativeTypeName[name].tsTypeName;
        }
        if (name === 'StructString') {
            return 'string';
        }
        return name;
    }

    /**
     * 将类型转换为TS类型，主要为了从MSG中取出数据
     * @param id 类型的ID
     * @returns 获取在MSG中取出时的Typescript类型
     */
    private _getMSGTSName(id: number) {
        const name = this.getSchemaTypeNameById(id);
        if (name in literalToNativeTypeName) {
            return literalToNativeTypeName[name].tsTypeName;
        }
        return name;
    }

    private _typeDefs: Map<number, IScopeContext> = new Map();
    private _idToScope: Map<number, string> = new Map();
}

