import path from 'path';
import { DirWalker } from './dirwalker';
import { SMessageCompiler } from './messagecompiler';
import { TypescriptCodeGen } from './typescriptgenerator';
import { versionStrToNums } from './version';

const option: {
    rootDir: string;
    outputDir: string;
    outputVersion: string;
} = {
    rootDir: '',
    outputDir: '',
    outputVersion: '',
};

for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === '-o') {
        if (i + 1 < process.argv.length) {
            option.outputDir = path.join(process.cwd(), process.argv[i + 1]);
            i++;
        }
    }
    if (process.argv[i] === '-i') {
        if (i + 1 < process.argv.length) {
            option.rootDir = path.join(process.cwd(), process.argv[i + 1]);
            i++;
        }
    }
    if (process.argv[i] === '-v') {
        if (i + 1 < process.argv.length) {
            option.outputVersion = process.argv[i + 1];
            i++;
        }
    }
}

const inputValid = option.rootDir.length > 0 && !option.rootDir.startsWith('-');
const outputValid = option.outputDir.length > 0 && !option.outputDir.startsWith('-');
const versionValid = versionStrToNums(option.outputVersion).length === 3;

if (!inputValid || !outputValid || !versionValid) {
    console.log(`Usage: ${process.argv[0]} ${process.argv[1]} -i inputDir -o outputDir -v currVersion`);
}

const dirWalker = new DirWalker(option.rootDir, option.outputDir);
const result = dirWalker.walkAllDir();
if (!result) {
    console.log(`The rootDir ${option.rootDir} cannot open for read.`);
}
if (dirWalker.getAllFiles().length === 0) {
    console.log(`The rootDir ${option.rootDir} has no idl files.`);
}

const compiler = new SMessageCompiler(dirWalker.getAllFiles(), option.outputVersion, dirWalker.hasHistory ? dirWalker.historyFileName : undefined);
compiler.compileAllFiles();

if (!compiler.currentSchema) {
    throw new Error('The schema compile error.');
}

const gen = new TypescriptCodeGen(compiler.currentSchema, option.outputDir, dirWalker.historyFileName);
gen.generate();
