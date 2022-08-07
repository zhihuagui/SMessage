import * as fs from 'fs';
import * as path from 'path';

const historyFName = '.smessage.json';

export class DirWalker {
    constructor(dir: string, outDir: string) {
        this._workingDir = dir;
        this._outDir = outDir;
    }

    public walkAllDir(): boolean {
        if (fs.statSync(this._workingDir).isDirectory()) {
            this.walkDir(this._workingDir, (fname) => {
                if (fname.endsWith('.idl')) {
                    this._allFiles.push(fname);
                } else {
                    console.log(`Ignore the file: ${fname}`);
                }
            });
            return true;
        }
        return false;
    }

    private walkDir(dir: string, callback: (fileName: string) => void) {
        fs.readdirSync(dir).forEach((fname) => {
            const fullPath = path.join(dir, fname);
            const stat = fs.statSync(fullPath);
            if (stat.isFile()) {
                callback(fullPath);
            } else if (stat.isDirectory()) {
                this.walkDir(fullPath, callback);
            }
        });
    }

    public getAllFiles() {
        return this._allFiles;
    }

    public get hasHistory() {
        if (fs.existsSync(this.historyFileName)) {
            return fs.statSync(this.historyFileName).isFile();
        }
        return false;
    }

    public get historyFileName() {
        return path.join(this._outDir, historyFName);
    }

    private _workingDir: string;
    private _outDir: string;
    private _allFiles: string[] = [];
}
