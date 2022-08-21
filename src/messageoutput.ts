import fs from 'fs';
import path from 'path';
import { SMessageSchemas, NativeSupportTypes, PredefinedTypes, StructDescription, EnumDescription, IAccessoryDesc, TypeDescType, MINUserDefTypeId } from './msgschema';

export enum OutPutType {
    Enum = 1,
    Struct,
    AccessoryStruct,
}


export class OutputGenerator {
    constructor(schema: SMessageSchemas, outDir: string, historyJson: string) {
        this.schema = schema;
        this.outDir = outDir;
        this._historyJson = historyJson;

        NativeSupportTypes.forEach((nst) => {
            if (this._idToBytesize.has(nst.typeId)) {
                throw new Error('Duplicate typeId detected.');
            }
            this._idToBytesize.set(nst.typeId, nst.byteSize);
        });

        PredefinedTypes.forEach((pdt) => {
            this._idToBytesize.set(pdt.typeId, pdt.preDefinedClass.prototype.byteLength);
        });

        this.schema.enumDefs.forEach((eds) => {
            if (this._idToBytesize.has(eds.typeId)) {
                throw new Error('Duplicate typeId detected.');
            }
            this._idToBytesize.set(eds.typeId, eds.dataType.byteSize);
            this.idToDesc.set(eds.typeId, eds);
            this.idToDependence.set(eds.typeId, []);
        });

        this.schema.structDefs.forEach((sds) => {
            if (this._idToBytesize.has(sds.typeId)) {
                throw new Error('Duplicate typeId detected.');
            }

            this._idToBytesize.set(sds.typeId, sds.size);
            this.idToDesc.set(sds.typeId, sds);
            const depends: Set<number> = new Set();
            sds.members.forEach(vlue => {
                if (vlue.type.descType === TypeDescType.CombineType || vlue.type.descType === TypeDescType.ArrayType || vlue.type.descType === TypeDescType.MapType) {
                    if (vlue.type.accessory) {
                        depends.add(vlue.type.accessory.typeId);
                    } else {
                        throw new Error('This must has the accessory.');
                    }
                } if (vlue.type.descType === TypeDescType.UserDefType) {
                    depends.add(vlue.type.typeId);
                }
            });
            this.idToDependence.set(sds.typeId, [...depends].filter(id => id >= MINUserDefTypeId));
        });

        this.schema.accessories.forEach((acs) => {
            this.idToDesc.set(acs.typeId, acs);
            this.idToDependence.set(acs.typeId, acs.relyTypes.filter(id => id >= MINUserDefTypeId));
        });

        this._analyseAllDepth();
    }

    public generate() {
        fs.writeFileSync(this._historyJson, JSON.stringify(this.schema));
    }

    protected writeScopeString(str: string, scope: string, extStr: string) {
        const subScopes = scope.split('.');
        const last = subScopes[subScopes.length - 1];

        let odir = this.outDir;
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
        const opath = path.join(this.outDir, target);
        const spath = path.join('src', srcFile);
        fs.copyFileSync(spath, opath);
    }

    protected getDescByTypeId(typeId: number) {
        const desc = this.idToDesc.get(typeId);
        if (!desc) {
            throw new Error(`The type ${typeId} has no desc.`);
        }
        return desc;
    }

    protected getTypeSizeFromTypeId(typeId: number) {
        if (this._idToBytesize.has(typeId)) {
            return this._idToBytesize.get(typeId);
        }
        throw new Error('Cannot find the type.');
    }

    private _analyseAllDepth() {
        this.idToDesc.forEach((_desc, id) => {
            if (this.idToDepth.has(id)) {
                return;
            }
            const curMets: Set<number> = new Set();
            const depthLocal: Map<number, number> = new Map();
            const rst = this._analyseStructRelyDepth(id, curMets, depthLocal);
            this.idToDepth.set(id, rst);
            depthLocal.forEach((v, k) => {
                this.idToDepth.set(k, v);
            });
        });
    }

    private _analyseStructRelyDepth(currId: number, curMets: Set<number>, idToDepthLocal: Map<number, number>): number {
        const desc = this.idToDesc.get(currId);
        if (!desc) {
            throw new Error(`No such typeId: ${currId}`);
        }
        if (curMets.has(currId)) {
            return Infinity;
        }
        const deps = this.idToDependence.get(currId);
        if (!deps) {
            throw new Error(`Cannot find the dependence of ${currId}`);
        }
        const depths = deps.map(dep => {
            let depth = this.idToDepth.get(dep)
            if (!depth) {
                depth = idToDepthLocal.get(dep);
            }
            if (!depth) {
                depth = this._analyseStructRelyDepth(dep, curMets, idToDepthLocal);
                idToDepthLocal.set(dep, depth);
            }
            return depth;
        });
        if (depths.length > 0) {
            const max = Math.max(...depths);
            return max + 1;
        }
        return 1;
    }

    protected schema: SMessageSchemas;
    protected outDir: string;
    protected idToDesc: Map<number, StructDescription | EnumDescription | IAccessoryDesc> = new Map();
    protected idToDependence: Map<number, number[]> = new Map();
    protected idToDepth: Map<number, number> = new Map();

    private _historyJson: string;
    private _idToBytesize: Map<number, number> = new Map();
}
