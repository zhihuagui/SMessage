
import { createToken, CstParser, IToken, Lexer, tokenMatcher, CstNode } from 'chevrotain';

// ----------------- lexer -----------------
const True = createToken({ name: "True", pattern: /true/ });
const False = createToken({ name: "False", pattern: /false/ });
const Null = createToken({ name: "Null", pattern: /null/ });
const LCurly = createToken({ name: "LCurly", pattern: /{/ });
const RCurly = createToken({ name: "RCurly", pattern: /}/ });
const LSquare = createToken({ name: "LSquare", pattern: /\[/ });
const RSquare = createToken({ name: "RSquare", pattern: /]/ });
const Comma = createToken({ name: "Comma", pattern: /,/ });
const Colon = createToken({ name: "Colon", pattern: /:/ });
const Semicolon = createToken({ name: "Semicolon", pattern: /;/ });
const Import = createToken({ name: 'Import', pattern: /import/ });
const From = createToken({ name: 'From', pattern: /from/ });
const Enum = createToken({ name: 'Enum', pattern: /enum/ });
const Export = createToken({ name: 'Export', pattern: /export/ });
const Struct = createToken({ name: 'Struct', pattern: /struct/ });
const Equals = createToken({ name: 'Equals', pattern: /=/ });
const Dot = createToken({ name: 'Dot', pattern: /\./ });
const OROP = createToken({ name: 'OROP', pattern: /\|/ });

const StringLiteral = createToken({
    name: "StringLiteral",
    pattern: /"(?:[^\\"]|\\(?:[bfnrtv"\\/]|u[0-9a-fA-F]{4}))*"/
});
const NumberLiteral = createToken({
    name: "NumberLiteral",
    pattern: /-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/
});
const WhiteSpace = createToken({
    name: "WhiteSpace",
    pattern: /[ \t\n\r]+/,
    group: Lexer.SKIPPED
});
const Comment = createToken({
    name: "Comment",
    pattern: /\/\/.*/
});

const MultiComment = createToken({
    name: "MultiComment",
    pattern: /\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\//,
});

const Literal = createToken({
    name: "Literal",
    pattern: /[_a-zA-Z][0-9_a-zA-Z]*/
});

const allTokens = [
    WhiteSpace,
    NumberLiteral,
    StringLiteral,
    LCurly,
    RCurly,
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
    Literal,
    Equals,
    Dot,
    OROP
];

const SMSGLexer = new Lexer(allTokens);

class SMSGParser extends CstParser {
    constructor() {
        super(allTokens);

        const $ = this;

        $.RULE('MidlFile', () => {
            $.MANY(() => {
                $.OR([
                    { ALT: () => $.SUBRULE($['import']) },
                    { ALT: () => $.SUBRULE($['enum']) },
                    { ALT: () => $.SUBRULE($['struct']) },
                ])
            })
        });

        $.RULE('memberValue', () => {
            $.OR([
                {
                    ALT: () => {
                        $.CONSUME1(Literal)
                        $.CONSUME(Dot)
                        $.CONSUME2(Literal)
                    }
                },
                { ALT: () => $.CONSUME(NumberLiteral) },
                { ALT: () => $.CONSUME(Literal) },
                { ALT: () => $.CONSUME(StringLiteral) },
                { ALT: () => $.CONSUME(True) },
                { ALT: () => $.CONSUME(False) },
            ]);
        });

        $.RULE('memberOrTypes', () => {
            $.SUBRULE($['memberValue'])
            $.MANY(() => {
                $.CONSUME(OROP)
                $.SUBRULE1($['memberValue'])
            })
        })

        $.RULE('memberDefine', () => {
            $.CONSUME(Literal)
            $.OPTION(() => {
                $.CONSUME(Colon);
                $.SUBRULE($['memberOrTypes']);
            })
        });

        $.RULE('struct', () => {
            $.CONSUME(Struct)
            $.CONSUME(Literal)
            $.CONSUME(LCurly)
            $.OPTION(() => {
                $.MANY(() => {
                    $.SUBRULE2($['memberDefine'])
                    $.CONSUME(Semicolon)
                })
            })
            $.CONSUME(RCurly)
        });

        $.RULE('enumMember', () => {
            $.CONSUME(Literal)
            $.OPTION(() => {
                $.CONSUME(Equals)
                $.OR([
                    { ALT: () => $.CONSUME(NumberLiteral) },
                    { ALT: () => $.CONSUME(StringLiteral) },
                ])
            })
        });

        $.RULE('enumDataType', () => {
            $.CONSUME(Colon);
            $.CONSUME1(Literal);
        });

        $.RULE('enum', () => {
            $.CONSUME(Enum)
            $.CONSUME(Literal)
            $.OPTION(() => {
                $.SUBRULE3($['enumDataType']);
            })
            $.CONSUME(LCurly)
            $.SUBRULE($['enumMember'])
            $.MANY(() => {
                $.CONSUME(Comma)
                $.SUBRULE2($['enumMember'])
            })
            $.CONSUME(RCurly)
        });

        $.RULE('import', () => {
            $.CONSUME(Import)
            $.CONSUME(LCurly)
            $.CONSUME(Literal)
            $.MANY(() => {
                $.CONSUME(Comma)
                $.CONSUME2(Literal)
            })
            $.CONSUME(RCurly)
            $.CONSUME(From)
            $.CONSUME(StringLiteral)
            $.CONSUME(Semicolon)
        });

        this.performSelfAnalysis();
    }

    override LA(howMuch: number): IToken {
        // Skip Comments during regular parsing as we wish to auto-magically insert them
        // into our CST
        let ntoken = super.LA(howMuch);
        while(tokenMatcher(ntoken, Comment) || tokenMatcher(ntoken, MultiComment)) {
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
        import?: IImportDef[];
        enum?: IEnumDef[];
        struct?: IStructDef[];
    }
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
    tokenType: TokenTypedef<name>
}

interface IImportDef {
    name: 'import';
    children: {
        Import: [TokenDef<'name'>];
        Literal: TokenDef<string>[];
        StringLiteral: [TokenDef<string>];
    }
}

interface IEnumDef {
    name: 'enum';
    children: {
        Enum: [TokenDef<'enum'>];
        Literal: [TokenDef<string>];
        enumDataType?: [{
            name: 'enumDataType';
            children: {
                Colon: [TokenDef<':'>];
                Literal: [TokenDef<string>];
            }
        }];
        enumMember: {
            name: 'enumMember';
            children: {
                Literal: [TokenDef<string>];
                Equals: [TokenDef<'='>];
                NumberLiteral?: [TokenDef<'NumberLiteral'>];
                StringLiteral?: [TokenDef<'StringLiteral'>];
            }
        }[];
    }
}

interface IStructDef {
    name: 'struct';
    children: {
        Struct: [TokenDef<'struct'>];
        Literal: [TokenDef<string>];
        memberDefine: {
            name: 'memberDefine';
            children: {
                Literal: [TokenDef<string>];
                Colon: [TokenDef<':'>];
                memberOrTypes: [{
                    name: 'memberOrTypes';
                    children: {
                        memberValue: {
                            name: 'memberValue';
                            children: {
                                Dot?: [TokenDef<'.'>];
                                Literal?: TokenDef<string>[];
                                NumberLiteral?: [TokenDef<'NumberLiteral'>];
                                StringLiteral?: [TokenDef<'StringLiteral'>];
                                True?: [TokenDef<'true'>];
                                False?: [TokenDef<'false'>];
                            }
                        }[];
                    }
                }];
            }
        }[];
    }
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
