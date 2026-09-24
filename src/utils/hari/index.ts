import { Lexer } from "./lexer";
import { Parser } from "./parser";
import { HariInterpreter } from "./interpreter";
import { HariError, HariRuntimeError, HariSyntaxReport } from "./errors";
import { registerStandardLibrary } from "./stdlib";
import { KoreanConfig } from "./config";
import { localize, syntaxError } from "./errs";

export async function runHari(
  code: string,
  inputCallback?: (promptText: string) => Promise<string>,
  outputCallback?: (msg: string) => void,
): Promise<string> {
  try {
    const lexer = new Lexer(code);
    const parser = new Parser(lexer.tokens);
    const ast = parser.parseProgram();
    const problems = parser.diagnostics;
    if (problems.length > 0) {
      // Like `hana run`: a file with syntax errors is reported, not run.
      const lines = problems.map((d) => localize(KoreanConfig.locale, syntaxError(d))).join("\n");
      throw new HariSyntaxReport(`구문 오류: ${problems[0].line}번째 줄\n${lines}`);
    }
    const interpreter = new HariInterpreter(ast, inputCallback, outputCallback);
    registerStandardLibrary(interpreter);
    return await interpreter.run();
  } catch (e: any) {
    if (e instanceof HariSyntaxReport) throw e.message;
    if (e instanceof HariError) {
      throw `구문 오류: ${e.line}번째 줄\n${e.message}`;
    }
    if (e instanceof HariRuntimeError) {
      throw `런타임 오류:\n${e.message}`;
    }
    throw `알 수 없는 오류:\n${e.stack || e.message || String(e)}`;
  }
}
