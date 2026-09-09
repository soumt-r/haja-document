import { Lexer } from './lexer';
import { Parser } from './parser';
import { HajaInterpreter } from './interpreter';
import { HajaError, HajaRuntimeError } from './types';

export async function runHaja(code: string, inputCallback?: (promptText: string) => Promise<string>, outputCallback?: (msg: string) => void): Promise<string> {
  try {
    const lexer = new Lexer(code);
    const parser = new Parser(lexer.tokens);
    const ast = parser.parse_program();
    const interpreter = new HajaInterpreter(ast, inputCallback, outputCallback);
    return await interpreter.run();
  } catch (e: any) {
    if (e instanceof HajaError) {
      throw `구문 오류: ${e.line}번째 줄\n${e.message}`;
    }
    if (e instanceof HajaRuntimeError) {
      throw `런타임 오류:\n${e.message}`;
    }
    throw `알 수 없는 오류:\n${e.stack || e.message || String(e)}`;
  }
}
