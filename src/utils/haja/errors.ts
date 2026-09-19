// TS-only infrastructure Go doesn't need: Go's lexer/parser collect errors
// into a `[]string` and let the caller decide what to do with them (see
// hana/cmd/run.go), and vm/interpreter.go signals control flow (return/break/
// throw) via plain `error` values (ReturnValue/BreakValue/ThrownError). A
// browser Playground wants immediate feedback instead, so this engine keeps
// the previous ad hoc engine's behavior of throwing on the first error, and
// uses real JS exceptions for control flow. index.ts's public contract
// depends on HajaError vs HajaRuntimeError being distinguishable (different
// message prefixes) and on HajaError's message containing "N번째 줄" for
// hajaLSP.ts's diagnostic-position regex — both preserved here verbatim.

export class HajaError extends Error {
  line: number;
  col: number;
  length: number;

  constructor(message: string, line: number, col = 0, length = 1) {
    super(`${line}번째 줄, ${col}번째 글자: ${message}`);
    this.name = "HajaError";
    this.line = line;
    this.col = col;
    this.length = length;
  }
}

// The parser found syntax problems; message is the finished, localized report
// (index.ts throws it as-is, without an engine-bug prefix).
export class HajaSyntaxReport extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HajaSyntaxReport";
  }
}

export class HajaRuntimeError extends Error {
  line: number | string;
  hajaObj?: unknown;

  constructor(message: string, line: number | string = "?", hajaObj?: unknown) {
    super(message);
    this.name = "HajaRuntimeError";
    this.line = line;
    this.hajaObj = hajaObj;
  }
}

// Control-flow signals — mirrors vm/interpreter.go's ReturnValue/BreakValue/
// ThrownError (Go signals these as `error` return values instead of
// exceptions, but the effect — unwind until the nearest handler — is the
// same either way).
export class ReturnSignal extends Error {
  value: unknown;
  constructor(value: unknown) {
    super("return");
    this.name = "ReturnSignal";
    this.value = value;
  }
}

export class BreakSignal extends Error {
  constructor() {
    super("break");
    this.name = "BreakSignal";
  }
}

// ThrownSignal carries a 하자-level thrown value (an ThownError-equivalent) —
// distinct from HajaRuntimeError, which is an *engine*-raised error (TypeError,
// IndexOutOfBoundsError, ...) not a user `던지자`.
export class ThrownSignal extends Error {
  value: unknown;
  constructor(value: unknown) {
    super(typeof value === "string" ? value : String(value));
    this.name = "ThrownSignal";
    this.value = value;
  }
}
