export function versionStrToNums(vstr: string) {
    const splits = vstr.split('.');
    if (splits.length === 3) {
        return splits.map((vs) => {
            return parseInt(vs);
        });
    }
    throw new Error('Version must have format: [uint16].[uint16].[uint16]');
}

export function isGraterThan(vstr: string, oriVstr: string) {
    const curV = versionStrToNums(vstr);
    const preV = versionStrToNums(oriVstr);
    if (curV[0] > preV[0] || curV[1] > preV[1] || curV[2] > preV[2]) {
        return true;
    }
    return false;
}
