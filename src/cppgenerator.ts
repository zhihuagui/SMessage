import { GenerateService } from './generateservice';

interface ScopeCtx {
    scope: string;
    header: string;
    cpp: string;
}

export class CppGenerator {
    constructor(genServ: GenerateService) {
        this._genServ = genServ;
        this._scopeCtx = [];
    }

    public generateToDir(dir: string) {
        this._genServ.writeScopeString('ctx', dir, 'h');
    }

    private _scopeCtx: ScopeCtx[];
    private _genServ: GenerateService;
}
