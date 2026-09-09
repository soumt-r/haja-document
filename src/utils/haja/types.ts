export class HajaError extends Error {
  line: number;
  col: number;
  length: number;

  constructor(msg: string, line: number, col: number, length: number = 1) {
    super(msg);
    this.name = 'HajaError';
    this.line = line;
    this.col = col;
    this.length = length;
  }
}

export class HajaRuntimeError extends Error {
  line: number;

  constructor(msg: string, line: number) {
    super(msg);
    this.name = 'HajaRuntimeError';
    this.line = line;
  }
}

export interface Token {
  type: string;
  value: string;
  line: number;
  col: number;
}

export type ASTNode = any; // Will use any for now to speed up the porting

export class BreakLoop extends Error {
  constructor() {
    super('BreakLoop');
    this.name = 'BreakLoop';
  }
}

export class ReturnValue extends Error {
  value: any;
  constructor(value: any) {
    super('ReturnValue');
    this.name = 'ReturnValue';
    this.value = value;
  }
}
