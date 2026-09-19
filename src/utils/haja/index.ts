import { Lexer } from "./lexer";
import { Parser } from "./parser";
import { HajaInterpreter } from "./interpreter";
import { HajaError, HajaRuntimeError, HajaSyntaxReport } from "./errors";
import { registerStandardLibrary } from "./stdlib";
import { KoreanConfig } from "./config";
import { localize, syntaxError } from "./errs";

export async function runHaja(
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
      throw new HajaSyntaxReport(`구문 오류: ${problems[0].line}번째 줄\n${lines}`);
    }
    const interpreter = new HajaInterpreter(ast, inputCallback, outputCallback);
    registerStandardLibrary(interpreter);
    return await interpreter.run();
  } catch (e: any) {
    if (e instanceof HajaSyntaxReport) throw e.message;
    if (e instanceof HajaError) {
      throw `구문 오류: ${e.line}번째 줄\n${e.message}`;
    }
    if (e instanceof HajaRuntimeError) {
      throw `런타임 오류:\n${e.message}`;
    }
    throw `알 수 없는 오류:\n${e.stack || e.message || String(e)}`;
  }
}
