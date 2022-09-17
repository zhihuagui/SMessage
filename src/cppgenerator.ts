import { GenerateService } from './generateservice';

interface ScopeCtx {
    scope: string;
    header: string;
    cpp: string;
}

export class CppGenerator {
    constructor(genServ: GenerateService, outputDir: string) {
        this._genServ = genServ;
        this._scopeCtx = [];
        this._outDir = outputDir;
    }

    public generateToDir(dir: string) {
        this._genServ.writeScopeString(this._outDir, 'ctx', dir, 'h');
    }

    private _scopeCtx: ScopeCtx[];
    private _genServ: GenerateService;
    private _outDir: string;
}
