import { createToken, CstParser, IToken, Lexer, tokenMatcher, CstNode } from 'chevrotain';

// ----------------- lexer -----------------
const Package = createToken({ name: 'Package', pattern: /package/ });
const True = createToken({ name: 'True', pattern: /true/ });
const False = createToken({ name: 'False', pattern: /false/ });
const Null = createToken({ name: 'Null', pattern: /null/ });
const LCurly = createToken({ name: 'LCurly', pattern: /{/ });
const RCurly = createToken({ name: 'RCurly', pattern: /}/ });
const LBracket = createToken({ name: 'LBracket', pattern: /\(/ });
const RBracket = createToken({ name: 'RBracket', pattern: /\)/ });
const LSquare = createToken({ name: 'LSquare', pattern: /\[/ });
const RSquare = createToken({ name: 'RSquare', pattern: /]/ });
const LAngleBracket = createToken({ name: 'LAngleBracket', pattern: /</ });
const RAngleBracket = createToken({ name: 'RAngleBracket', pattern: />/ });
const Comma = createToken({ name: 'Comma', pattern: /,/ });
const Colon = createToken({ name: 'Colon', pattern: /:/ });
const Semicolon = createToken({ name: 'Semicolon', pattern: /;/ });
const Import = createToken({ name: 'Import', pattern: /import/ });
const From = createToken({ name: 'From', pattern: /from/ });
const Enum = createToken({ name: 'Enum', pattern: /enum/ });
const Export = createToken({ name: 'Export', pattern: /export/ });
const Struct = createToken({ name: 'Struct', pattern: /struct/ });
const Equals = createToken({ name: 'Equals', pattern: /=/ });
const Dot = createToken({ name: 'Dot', pattern: /\./ });
const OROP = createToken({ name: 'OROP', pattern: /\|/ });

const StringLiteral = createToken({
    name: 'StringLiteral',
    pattern: /"(?:[^\\"]|\\(?:[bfnrtv"\\/]|u[0-9a-fA-F]{4}))*"/,
});
const NumberLiteral = createToken({
    name: 'NumberLiteral',
    pattern: /-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/,
});
const WhiteSpace = createToken({
    name: 'WhiteSpace',
    pattern: /[ \t\n\r]+/,
    group: Lexer.SKIPPED,
});
const Comment = createToken({
    name: 'Comment',
    pattern: /\/\/.*/,
});

const MultiComment = createToken({
    name: 'MultiComment',
    pattern: /\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\//,
});

const Literal = createToken({
    name: 'Literal',
    pattern: /[_a-zA-Z][0-9_a-zA-Z]*/,
});

const allTokens = [
    WhiteSpace,
    NumberLiteral,
    StringLiteral,
    LCurly,
    RCurly,
    LBracket,
    RBracket,
    LAngleBracket,
    RAngleBracket,
    LSquare,
    RSquare,
    Comma,
    Colon,
    Semicolon,
    True,
    False,
    Null,
    Comment,
    MultiComment,
    Import,
    From,
    Export,
    Enum,
    Struct,
    Package,
    Equals,
    Dot,
    OROP,
    Literal,
];

const SMSGLexer = new Lexer(allTokens);

class SMSGParser extends CstParser {
    constructor() {
        super(allTokens);

        const $ = this;

        $.RULE('MidlFile', () => {
            $.MANY(() => {
                $.OR([{ ALT: () => $.SUBRULE($['package']) }, { ALT: () => $.SUBRULE($['import']) }, { ALT: () => $.SUBRULE($['enum']) }, { ALT: () => $.SUBRULE($['struct']) }]);
            });
        });

        $.RULE('packageName', () => {
            $.CONSUME(Literal);
            $.MANY(() => {
                $.CONSUME(Dot);
                $.CONSUME1(Literal);
            });
        });

        $.RULE('package', () => {
            $.CONSUME(Package);
            $.SUBRULE($['packageName']);
            $.CONSUME(Semicolon);
        });

        $.RULE('baseType', () => {
            $.OR([
                {
                    ALT: () => {
                        $.CONSUME(Literal);
                        $.MANY(() => {
                            $.CONSUME(Dot);
                            $.CONSUME1(Literal);
                        });
                    },
                },
                {
                    ALT: () => {
                        $.CONSUME(LBracket);
                        $.SUBRULE($['combineType']);
                        $.CONSUME(RBracket);
                    },
                },
                {
                    ALT: () => {
                        $.CONSUME(LAngleBracket);
                        $.CONSUME2(Literal);
                        $.CONSUME(Comma);
                        $.SUBRULE2($['combineType']);
                        $.CONSUME(RAngleBracket);
                    },
                },
            ]);
            $.MANY1(() => {
                $.CONSUME(LSquare);
                $.CONSUME(RSquare);
            });
        });

        $.RULE('combineType', () => {
            $.SUBRULE($['baseType']);
            $.MANY(() => {
                $.CONSUME(OROP);
                $.SUBRULE1($['baseType']);
            });
        });

        $.RULE('memberDefine', () => {
            $.CONSUME(Literal);
            $.OPTION(() => {
                $.CONSUME(Colon);
                $.SUBRULE($['combineType']);
            });
        });

        $.RULE('struct', () => {
            $.CONSUME(Struct);
            $.CONSUME(Literal);
            $.CONSUME(LCurly);
            $.OPTION(() => {
                $.MANY(() => {
                    $.SUBRULE2($['memberDefine']);
                    $.CONSUME(Semicolon);
                });
            });
            $.CONSUME(RCurly);
        });

        $.RULE('enumMember', () => {
            $.CONSUME(Literal);
            $.OPTION(() => {
                $.CONSUME(Equals);
                $.CONSUME(NumberLiteral);
            });
        });

        $.RULE('enumDataType', () => {
            $.CONSUME(Colon);
            $.CONSUME1(Literal);
        });

        $.RULE('enum', () => {
            $.CONSUME(Enum);
            $.CONSUME(Literal);
            $.OPTION(() => {
                $.SUBRULE3($['enumDataType']);
            });
            $.CONSUME(LCurly);
            $.SUBRULE($['enumMember']);
            $.MANY(() => {
                $.CONSUME(Comma);
                $.SUBRULE2($['enumMember']);
            });
            $.OPTION2(() => $.CONSUME2(Comma));
            $.CONSUME(RCurly);
        });

        $.RULE('import', () => {
            $.CONSUME(Import);
            $.CONSUME(LCurly);
            $.CONSUME(Literal);
            $.MANY(() => {
                $.CONSUME(Comma);
                $.CONSUME2(Literal);
            });
            $.CONSUME(RCurly);
            $.CONSUME(From);
            $.SUBRULE($['packageName']);
            $.CONSUME(Semicolon);
        });

        this.performSelfAnalysis();
    }

    override LA(howMuch: number): IToken {
        // Skip Comments during regular parsing as we wish to auto-magically insert them
        // into our CST
        let ntoken = super.LA(howMuch);
        while (tokenMatcher(ntoken, Comment) || tokenMatcher(ntoken, MultiComment)) {
            this.consumeToken();
            ntoken = super.LA(howMuch);
        }

        return ntoken;
    }

    override cstPostTerminal(key: string, consumedToken: IToken): void {
        super.cstPostTerminal(key, consumedToken);

        let lookBehindIdx = -1;
        let prevToken = super.LA(lookBehindIdx);

        // After every Token (terminal) is successfully consumed
        // We will add all the comment that appeared before it to the CST (Parse Tree)
        while (tokenMatcher(prevToken, Comment) || tokenMatcher(prevToken, MultiComment)) {
            super.cstPostTerminal(prevToken.tokenType.name, prevToken);
            lookBehindIdx--;
            prevToken = super.LA(lookBehindIdx);
        }
    }
}

export interface ISMSGParserResult {
    name: 'MidlFile';
    children: {
        package?: IPackageDef[];
        import?: IImportDef[];
        enum?: IEnumDef[];
        struct?: IStructDef[];
    };
}

interface TokenTypedef<name extends string> {
    name: name;
}

interface TokenDef<name extends string> {
    image: name;
    startLine: number;
    startColumn: number;
    startOffset: number;
    endLine: number;
    endColumn: number;
    endOffset: number;
    tokenType: TokenTypedef<name>;
}

interface IImportDef {
    name: 'import';
    children: {
        Import: [TokenDef<'name'>];
        Literal: TokenDef<string>[];
        packageName: [
            {
                name: 'packageName';
                children: {
                    Dot: TokenDef<'.'>[];
                    Literal: TokenDef<string>[];
                };
            },
        ];
    };
}

interface IPackageDef {
    name: 'package';
    children: {
        Package: [TokenDef<'package'>];
        packageName: [
            {
                name: 'packageName';
                children: {
                    Dot: TokenDef<'.'>[];
                    Literal: TokenDef<string>[];
                };
            },
        ];
    };
}

export interface IEnumDef {
    name: 'enum';
    children: {
        Enum: [TokenDef<'enum'>];
        Literal: [TokenDef<string>];
        enumDataType?: [
            {
                name: 'enumDataType';
                children: {
                    Colon: [TokenDef<':'>];
                    Literal: [TokenDef<string>];
                };
            },
        ];
        enumMember: {
            name: 'enumMember';
            children: {
                Literal: [TokenDef<string>];
                Equals: [TokenDef<'='>];
                NumberLiteral?: [TokenDef<string>];
            };
        }[];
    };
}

export interface IBaseType {
    name: 'baseType';
    children:
        | {
              Literal: [TokenDef<string>];
              LSquare?: TokenDef<'['>[];
              RSquare?: TokenDef<']'>[];
          }
        | {
              combineType: [ICombineType];
              LSquare?: TokenDef<'['>[];
              RSquare?: TokenDef<']'>[];
          }
        | {
              Literal: [TokenDef<string>];
              Comma: [TokenDef<','>];
              combineType: [ICombineType];
              LAngleBracket: [TokenDef<'<'>];
              RAngleBracket: [TokenDef<'>'>];
          };
}

export interface ICombineType {
    name: 'combineType';
    children: {
        baseType: IBaseType[];
    };
}

export interface IStructDef {
    name: 'struct';
    children: {
        Struct: [TokenDef<'struct'>];
        Literal: [TokenDef<string>];
        memberDefine: {
            name: 'memberDefine';
            children: {
                Literal: [TokenDef<string>];
                Colon: [TokenDef<':'>];
                combineType: [ICombineType];
            };
        }[];
    };
}

export function parseMIDL(text: string) {
    const parser = new SMSGParser();
    const lexResult = SMSGLexer.tokenize(text);
    parser.input = lexResult.tokens;

    const cst: ISMSGParserResult = parser['MidlFile']();

    return {
        cst,
        lexError: lexResult.errors,
        parseError: parser.errors,
    };
}
