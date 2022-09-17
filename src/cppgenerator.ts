import { OutputGenerator } from './messageoutput';

interface ScopeCtx {
    scope: string;
    header: string;
    cpp: string;
}

export class CppGenerator {
    constructor(baseGen: OutputGenerator) {
        this._baseGen = baseGen;
        this._scopeCtx = [];
    }

    public generateToDir(dir: string) {
        this._baseGen.writeScopeString('ctx', dir, 'h');
    }

    private _scopeCtx: ScopeCtx[];
    private _baseGen: OutputGenerator;
}
