// Mirrors hana/parser/hari/langprofile.go. This repo never shares a Parser
// across locales the way Go's parser/hari does (hari-docs and kanade-docs
// each keep their own full copy per the "구조만 미러링" decision), so
// LangProfile here isn't parameterizing a generic parser — it's just pulled
// out of parser.ts into its own file to keep the two repos' parser.ts files
// structurally comparable (parser.ts body nearly identical, langProfile.ts
// is where the actual per-language literals live).
import type { Token } from "./token";

export enum LoopKind {
  ForEach,
  While,
  Range,
}

// Component mirrors parser/hari/parser.go's local `Component` struct: one
// collected (expression, trailing particles) pair from parseGenericSov's
// component-accumulation loop.
export interface Component {
  expr: import("./ast").Expression;
  particles: string[];
  // The `[타입]인 값` annotation this component had, if any (declared types).
  type: import("./ast").TypeReference | null;
}

export interface LangProfile {
  errorLiterals: string[];
  pluralSelfWords: string[];
  conditionThenWords: string[];
  poppedValueWord: string;
  memberParticle: string;
  typeInWord: string;
  templatePrefix: string;
  templateSuffix: string;
  constructorFunctionName: string;
  frontMarker: string;
  accessModifierFromVerb(literal: string): string;
  isConstVerb(literal: string): boolean;
  isPrintInlineVerb(literal: string): boolean;
  classifyLoop(verb: Token, components: Component[]): LoopKind;
  normalizeCompareOpSOV(op: string): string;
  normalizeCompareOpSVO(op: string): string;
  importAsParticles: string[];
  // The word that imports a whole module, and the particles joining an import list's items.
  importAllWord: string;
  importJoinParticles: string[];
  delimLen: number;
  typeOpen: string;
  typeClose: string;
}

export function literalIn(literal: string, options: string[]): boolean {
  return options.includes(literal);
}

export const hariProfile: LangProfile = {
  errorLiterals: ["오류", "오류가"],
  pluralSelfWords: ["우리", "'우리'"],
  conditionThenWords: ["라면"],
  poppedValueWord: "값",
  memberParticle: "의",
  typeInWord: "인",
  templatePrefix: '틀"',
  templateSuffix: '"',
  constructorFunctionName: "처음 만들어질 때",
  frontMarker: "앞",
  accessModifierFromVerb(literal: string): string {
    if (literal.endsWith("숨기자")) return "private";
    if (literal.endsWith("물려주자")) return "protected";
    return "public";
  },
  isConstVerb(literal: string): boolean {
    return literal.endsWith("고정하자");
  },
  isPrintInlineVerb(literal: string): boolean {
    return literal.endsWith("이어출력하자");
  },
  classifyLoop(verb: Token, components: Component[]): LoopKind {
    if (components.length === 1) return LoopKind.ForEach;
    if (components.length >= 2) {
      const last = components[components.length - 1].expr;
      if (last.type === "Identifier" && (last.value === "동안" || last.value === "동안은")) {
        return LoopKind.While;
      }
    }
    return LoopKind.Range;
  },
  normalizeCompareOpSOV(op: string): string {
    if (op.includes("일종이다")) return "instanceof";
    if (op.includes("같다") && op.includes("!")) return "!=";
    if (op.includes("같다")) return "==";
    if (op.includes("크다")) return ">";
    if (op.includes("작다")) return "<";
    if (op.includes("이상이다")) return ">=";
    if (op.includes("이하이다")) return "<=";
    if (op.includes("다르다") || op.includes("않다")) return "!=";
    return op;
  },
  normalizeCompareOpSVO(op: string): string {
    if (op === "같다") return "==";
    if (op === "다르다" || op === "같지 않다") return "!=";
    return op;
  },
  importAsParticles: ["로", "으로"],
  importAllWord: "전부",
  importJoinParticles: ["와", "과"],
  delimLen: 1,
  typeOpen: "[",
  typeClose: "]",
};
