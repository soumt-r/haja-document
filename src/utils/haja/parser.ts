import { HajaError, type Token, type ASTNode } from './types';
import { Lexer } from './lexer';

export class Parser {
  tokens: Token[];
  pos: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek(offset = 0): Token | null {
    return this.pos + offset < this.tokens.length ? this.tokens[this.pos + offset] : null;
  }

  consume(expected_type?: string): Token {
    const tok = this.peek();
    if (!tok) {
      const prev = this.tokens.length > 0 ? this.tokens[this.tokens.length - 1] : { line: 1, col: 0, value: '', type: '' };
      throw new HajaError("SyntaxError: 코드가 중간에 끊긴 것 같아요.", prev.line, prev.col, 1);
    }
    if (expected_type && tok.type !== expected_type) {
      throw new HajaError(`SyntaxError: [${expected_type}] 형식이 필요한데, 어색한 값 '${tok.value}'(이)가 들어왔어요.`, tok.line, tok.col, Math.max(1, tok.value.length));
    }
    this.pos += 1;
    return tok;
  }

  parse_program(): ASTNode {
    const statements: ASTNode[] = [];
    while (this.peek()) {
      const stmt = this.parse_statement();
      if (stmt) statements.push(stmt);
    }
    return { type: "Program", body: statements };
  }

  parse_block(): ASTNode {
    this.consume('COLON');
    if (this.peek()?.type === 'INDENT') {
      this.consume('INDENT');
      const statements: ASTNode[] = [];
      while (this.peek() && this.peek()?.type !== 'DEDENT') {
        const stmt = this.parse_statement();
        if (stmt) statements.push(stmt);
      }
      if (this.peek()?.type === 'DEDENT') {
        this.consume('DEDENT');
      }
      return { type: "BlockStatement", body: statements };
    }
    return { type: "BlockStatement", body: [] };
  }

  _do_parse_statement(): ASTNode | null {
    const is_mod = this.peek()?.type === 'TYPE' || this.peek()?.type === 'STRING';
    if (is_mod && this.peek(1)?.value === '에서') {
      const mod_tok = this.consume();
      const mod = mod_tok.value.slice(1, -1);
      const is_builtin = mod_tok.type === 'TYPE';
      this.consume('PARTICLE');
      
      if (this.peek()?.type === 'KW_ALL') {
        this.consume('KW_ALL');
        this.consume('KW_IMPORT');
        return { type: "ImportStatement", module: mod, selective: false, items: [], is_builtin };
      }
      
      const items = [];
      while (true) {
        const item_tok = this.consume();
        if (!['TYPE', 'FUNCTION', 'VARIABLE'].includes(item_tok.type)) {
          throw new Error(`SyntaxError: 가져올 항목이 올바르지 않아요: ${item_tok.value}`);
        }
        const name = item_tok.value.slice(1, -1);
        items.push({ type: item_tok.type, name });
        
        const part = this.consume('PARTICLE');
        if (part.value === '과' || part.value === '와') continue;
        if ((part.value === '를' || part.value === '을') && this.peek()?.type === 'KW_IMPORT') {
          this.consume('KW_IMPORT');
          break;
        }
        throw new Error(`SyntaxError: 예상치 못한 조사가 붙어있어요: ${part.value}`);
      }
      return { type: "ImportStatement", module: mod, selective: true, items, is_builtin };
    }

    const tok = this.peek();
    if (!tok) return null;

    if (tok.type === 'INDENT' || tok.type === 'DEDENT') {
      this.consume();
      return null;
    }

    if (tok.type === 'TYPE') {
      const saved_pos = this.pos;
      this.pos += 1;
      if (this.peek()?.type === 'PARTICLE') this.pos += 1;
      const next_tok = this.peek();
      this.pos = saved_pos;

      if (next_tok?.type === 'KW_RETURN_TYPE') return this.parse_function_decl();
      if (next_tok?.type === 'KW_INTERFACE') return this.parse_interface();
      if (next_tok?.type === 'LPAREN') return this.parse_generic_sov();
      return this.parse_class();
    }

    if (tok.type === 'FUNCTION') {
      const saved_pos = this.pos;
      this.pos += 1;
      if (this.peek()?.type === 'PARTICLE') this.pos += 1;
      const is_decl = this.peek()?.type === 'KW_FUNC' || this.peek()?.type === 'KW_REQUIRE';
      this.pos = saved_pos;
      if (is_decl) return this.parse_function_decl();
      return this.parse_generic_sov();
    }

    if (tok.type === 'KW_CONSTRUCT') return this.parse_constructor_decl();
    if (tok.type === 'KW_IF') return this.parse_if();
    if (tok.type === 'KW_TRY') return this.parse_try();
    if (tok.type === 'KW_CATCH') throw new HajaError("SyntaxError: '오류가 발생했다면'은 반드시 '일단 해보자' 다음에 와야 해요.", tok.line, tok.col, Math.max(1, tok.value.length));
    if (tok.type === 'KW_FINALLY') throw new HajaError("SyntaxError: '마무리는 항상'은 반드시 '일단 해보자' 다음에 와야 해요.", tok.line, tok.col, Math.max(1, tok.value.length));
    
    let isForRange = false;
    for (let i = this.pos; i < this.tokens.length && this.tokens[i].type !== 'COLON' && this.tokens[i].line === tok.line; i++) {
      if (this.tokens[i].type === 'KW_FROM') {
        isForRange = true;
        break;
      }
    }
    if (isForRange) return this.parse_for_range();
    if (tok.type === 'KW_BREAK') {
      this.consume();
      return { type: "BreakStatement" };
    }

    return this.parse_generic_sov();
  }

  parse_statement(): ASTNode | null {
    const tok = this.peek();
    if (!tok) return null;
    const line = tok.line;
    const node = this._do_parse_statement();
    if (node && typeof node === 'object') {
      node.line = line;
    }
    return node;
  }

  parse_interface(): ASTNode {
    const name = this.consume('TYPE').value.slice(1, -1);
    if (this.peek()?.type === 'PARTICLE') this.consume();
    this.consume('KW_INTERFACE');
    const block = this.parse_block();
    return { type: "InterfaceDeclaration", id: name, body: block.body };
  }

  parse_class(): ASTNode {
    let name = "알수없음";
    let baseClass = null;
    const interfaces: string[] = [];
    
    while (this.peek() && this.peek()?.type !== 'KW_CLASS' && this.peek()?.type !== 'COLON') {
      if (this.peek()?.type === 'TYPE') {
        const typeName = this.consume('TYPE').value.slice(1, -1);
        if (this.peek()?.type === 'PARTICLE') this.consume();
        
        if (this.peek()?.type === 'KW_BASE') {
          this.consume('KW_BASE');
          baseClass = typeName;
        } else if (this.peek()?.type === 'KW_IMPLEMENTS') {
          this.consume('KW_IMPLEMENTS');
          interfaces.push(typeName);
        } else {
          name = typeName;
        }
      } else {
        this.consume();
      }
    }
    if (this.peek()?.type === 'KW_CLASS') this.consume('KW_CLASS');
    
    const block = this.parse_block();
    return { type: "ClassDeclaration", id: name, baseClass, interfaces, body: block.body };
  }

  parse_function_decl(): ASTNode {
    let return_type = null;
    if (this.peek()?.type === 'TYPE') {
      return_type = { type: "TypeReference", name: this.consume('TYPE').value.slice(1, -1) };
      if (this.peek()?.type === 'PARTICLE') this.consume();
      this.consume('KW_RETURN_TYPE');
    }
    const name = this.consume('FUNCTION').value.slice(1, -1);
    if (this.peek()?.type === 'PARTICLE') this.consume();

    if (this.peek()?.type === 'TYPE' && this.peek(1)?.value === '모듈을' && this.peek(2)?.type === 'KW_IMPORT') {
      const mod = this.consume().value.slice(1, -1);
      this.consume('VARIABLE');
      this.consume('KW_IMPORT');
      return { type: "ImportStatement", module: mod };
    }

    let action = null;
    if (this.peek()?.type === 'KW_FUNC') action = this.consume('KW_FUNC');
    else if (this.peek()?.type === 'KW_REQUIRE') action = this.consume('KW_REQUIRE');

    this.consume('LPAREN');
    const params = [];
    while (this.peek() && this.peek()?.type !== 'RPAREN') {
      let paramType = null;
      if (this.peek()?.type === 'TYPE') {
        paramType = { type: "TypeReference", name: this.consume('TYPE').value.slice(1, -1) };
        if (this.peek()?.type === 'TYPE_IN') this.consume('TYPE_IN');
      }
      
      const paramName = this.consume('VARIABLE').value.slice(1, -1);
      let defaultVal = null;
      
      if (this.peek()?.type === 'ASSIGN_OP') {
        this.consume('ASSIGN_OP');
        defaultVal = this.parse_expression();
      }
      
      params.push({ type: paramType, name: paramName, default: defaultVal });
      
      if (this.peek()?.type === 'COMMA') this.consume('COMMA');
    }
    this.consume('RPAREN');

    if (action?.type === 'KW_REQUIRE') {
      return { type: "InterfaceMethod", id: name, returnType: return_type, params };
    }

    const block = this.parse_block();
    const acc = action?.value.includes("숨기자") ? "private" : action?.value.includes("물려주자") ? "protected" : "public";
    return { type: "FunctionDeclaration", id: name, returnType: return_type, accessModifier: acc, params, body: block.body };
  }

  parse_constructor_decl(): ASTNode {
    this.consume('KW_CONSTRUCT');
    this.consume('LPAREN');
    const params = [];
    while (this.peek() && this.peek()?.type !== 'RPAREN') {
      const tok = this.consume();
      if (tok.type === 'VARIABLE') {
        params.push({ type: "Identifier", name: tok.value.slice(1, -1) });
      }
    }
    this.consume('RPAREN');
    if (this.peek()?.type === 'KW_DO_AS') this.consume('KW_DO_AS');
    const block = this.parse_block();
    return { type: "ConstructorDeclaration", params, body: block.body };
  }

  parse_condition(): ASTNode {
    if (this.peek()?.type === 'LPAREN') {
      this.consume('LPAREN');
      const components = [];
      while (this.peek() && this.peek()?.type !== 'COMPARE' && this.peek()?.type !== 'RPAREN') {
        components.push(this.parse_expression());
        if (this.peek()?.type === 'PARTICLE') this.consume();
      }
      let cond_ast = components[0];
      if (this.peek()?.type === 'COMPARE') {
        let op = this.consume().value;
        if (op.includes('일종이다')) op = 'instanceof';
        else if (op.includes('같다')) op = '==';
        else if (op.includes('크다')) op = '>';
        else if (op.includes('작다')) op = '<';
        else if (op.includes('이상이다')) op = '>=';
        else if (op.includes('이하이다')) op = '<=';
        else if (op.includes('다르다')) op = '!=';
        const left = components[0];
        const right = components.length > 1 ? components[1] : null;
        cond_ast = { type: "BinaryExpression", operator: op, left, right };
      }
      this.consume('RPAREN');
      if (this.peek()?.type === 'LOGIC') {
        const logic = this.consume().value;
        const right_cond = this.parse_condition();
        return { type: "LogicalExpression", operator: logic, left: cond_ast, right: right_cond };
      }
      return cond_ast;
    }
    return this.parse_expression();
  }

  parse_if(): ASTNode {
    this.consume('KW_IF');
    const cond_ast = this.parse_condition();
    while (this.peek() && this.peek()?.type !== 'COLON') this.consume();
    const block = this.parse_block();
    const node: ASTNode = { type: "IfStatement", condition: cond_ast, consequent: block.body, elifs: [], alternate: null };
    
    while (this.peek()?.type === 'KW_ELIF') {
      this.consume('KW_ELIF');
      const elif_cond = this.parse_condition();
      while (this.peek() && this.peek()?.type !== 'COLON') this.consume();
      const elif_block = this.parse_block();
      node.elifs.push({ condition: elif_cond, consequent: elif_block.body });
    }

    if (this.peek()?.type === 'KW_ELSE') {
      this.consume('KW_ELSE');
      while (this.peek() && this.peek()?.type !== 'COLON') this.consume();
      const alt_block = this.parse_block();
      node.alternate = alt_block.body;
    }
    return node;
  }

  parse_try(): ASTNode {
    this.consume('KW_TRY');
    const block = this.parse_block();
    const node: ASTNode = { type: "TryStatement", block: block.body, handler: null, finalizer: null };
    if (this.peek()?.type === 'KW_CATCH') node.handler = this.parse_catch();
    if (this.peek()?.type === 'KW_FINALLY') {
      this.consume('KW_FINALLY');
      const fin_block = this.parse_block();
      node.finalizer = fin_block.body;
    }
    return node;
  }

  parse_catch(): ASTNode {
    this.consume('KW_CATCH');
    this.consume('LPAREN');
    const variable = this.consume('VARIABLE');
    this.consume('RPAREN');
    const block = this.parse_block();
    return { type: "CatchClause", param: { type: "Identifier", name: variable.value.slice(1, -1) }, body: block.body };
  }

  parse_for_range(): ASTNode {
    const start = this.parse_expression();
    this.consume('KW_FROM');
    const end = this.parse_expression();
    this.consume('KW_TO');
    
    let variable = null;
    if (this.peek()?.type === 'LPAREN') {
      this.consume('LPAREN');
      variable = this.consume('VARIABLE').value.slice(1, -1);
      this.consume('RPAREN');
    }
    const block = this.parse_block();
    return { type: "ForRangeStatement", start, end, iterator: variable, body: block.body };
  }

  parse_primary(): ASTNode {
    const tok = this.peek();
    if (!tok) return { type: "Unknown", value: "" };

    if (['NUMBER', 'STRING', 'BOOLEAN', 'NULL'].includes(tok.type)) {
      return { type: "Literal", value: this.consume().value };
    } else if (tok.type === 'FORMAT_STR') {
      const val = this.consume().value.slice(2, -1);
      const parts = val.split(/(\{[^}]+\})/);
      const quasis: string[] = [];
      const expressions: ASTNode[] = [];
      for (const p of parts) {
        if (p.startsWith('{') && p.endsWith('}')) {
          const inner_code = p.slice(1, -1);
          const inner_lexer = new Lexer(inner_code);
          const inner_parser = new Parser(inner_lexer.tokens);
          expressions.push(inner_parser.parse_expression());
        } else {
          const unescaped = p.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
          quasis.push(unescaped);
        }
      }
      return { type: "TemplateLiteral", quasis, expressions };
    } else if (tok.type === 'VARIABLE') {
      return { type: "Identifier", name: this.consume().value.slice(1, -1) };
    } else if (tok.type === 'FUNCTION') {
      return { type: "FunctionReference", name: this.consume().value.slice(1, -1) };
    } else if (tok.type === 'KW_PARENT') {
      this.consume('KW_PARENT');
      return { type: "SuperReference" };
    } else if (tok.type === 'KW_OUTER') {
      this.consume('KW_OUTER');
      return { type: "OuterReference" };
    } else if (tok.type === 'KW_CONSTRUCT') {
      this.consume('KW_CONSTRUCT');
      return { type: "FunctionReference", name: "처음 만들어질 때" };
    } else if (tok.type === 'EMPTY_LIST') {
      this.consume();
      return { type: "ListLiteral", elements: [] };
    } else if (tok.type === 'LBRACKET') {
      this.consume('LBRACKET');
      const elements = [];
      while (this.peek() && this.peek()?.type !== 'RBRACKET') {
        elements.push(this.parse_expression());
        if (this.peek()?.type === 'COMMA') this.consume('COMMA');
      }
      this.consume('RBRACKET');
      return { type: "ListLiteral", elements };
    } else if (tok.type === 'EMPTY_DICT') {
      this.consume();
      return { type: "DictLiteral", elements: [] };
    } else if (tok.type === 'LBRACE') {
      this.consume('LBRACE');
      const elements = [];
      while (this.peek() && this.peek()?.type !== 'RBRACE') {
        const key = this.parse_expression();
        this.consume('COLON');
        const value = this.parse_expression();
        elements.push({ key, value });
        if (this.peek()?.type === 'COMMA') this.consume('COMMA');
      }
      this.consume('RBRACE');
      return { type: "DictLiteral", elements };
    } else if (tok.type === 'LPAREN') {
      const cond = this.parse_condition();
      return cond;
    } else if (tok.type === 'TYPE') {
      const t = this.consume();
      if (this.peek()?.type === 'LPAREN') {
        this.consume('LPAREN');
        const args = this.parse_arguments();
        this.consume('RPAREN');
        return { type: "NewExpression", class: t.value.slice(1, -1), arguments: args };
      }
      return { type: "TypeLiteral", name: t.value.slice(1, -1) };
    } else if (tok.type === 'KW_LENGTH') {
      return { type: "LengthLiteral", value: this.consume().value };
    }
    return { type: "Unknown", value: this.consume().value };
  }

  parse_arguments(): ASTNode[] {
    const args = [];
    while (this.peek() && this.peek()?.type !== 'RPAREN') {
      args.push(this.parse_expression());
      if (this.peek()?.type === 'COMMA') this.consume('COMMA');
    }
    return args;
  }

  parse_expression(): ASTNode {
    let expr = this.parse_primary();
    
    while (this.peek()) {
      if (this.peek()?.type === 'KW_INDEX') {
        this.consume('KW_INDEX');
        expr = { type: "IndexExpression", index: expr };
      } else if (this.peek()?.type === 'PARTICLE' && this.peek()?.value === '의') {
        this.consume('PARTICLE');
        let prop = this.parse_primary();
        if (this.peek()?.type === 'KW_INDEX') {
          this.consume('KW_INDEX');
          prop = { type: "IndexExpression", index: prop };
        }
        expr = { type: "MemberExpression", object: expr, property: prop };
      } else if (this.peek()?.type === 'LPAREN') {
        this.consume('LPAREN');
        const args = this.parse_arguments();
        this.consume('RPAREN');
        expr = { type: "CallExpression", callee: expr, arguments: args };
      } else if (this.peek()?.type === 'OP') {
        const op = this.consume().value;
        const right = this.parse_expression();
        expr = { type: "BinaryExpression", operator: op, left: expr, right: right };
      } else {
        break;
      }
    }
    return expr;
  }

  parse_generic_sov(): ASTNode | null {
    const components: any[] = [];
    const verbs = ['KW_ASSIGN', 'KW_DECLARE', 'KW_ADD', 'KW_SUB', 'KW_APPEND', 'KW_PRINT', 'KW_PRINT_INLINE', 'KW_INPUT', 'KW_RETURN', 'KW_EXECUTE', 'KW_THROW', 'KW_FOREACH', 'KW_WHILE', 'KW_IMPORT', 'KW_SWITCH', 'KW_FALLTHROUGH'];
    
    while (this.peek() && !verbs.includes(this.peek()!.type)) {
      if (this.peek()?.type === 'TYPE') {
        const saved = this.pos;
        const t = this.consume();
        if (this.peek()?.type === 'TYPE_IN') {
          this.consume('TYPE_IN');
          components.push({ role: "type_cast", type_val: t.value.slice(1, -1) });
          continue;
        } else {
          this.pos = saved; // backtrack
        }
      }
      
      const expr = this.parse_expression();
      let part = null;
      if (this.peek()?.type === 'PARTICLE') {
        part = this.consume().value;
      }
      components.push({ expr, particle: part });
    }
    
    if (!this.peek()) return null;
    const verb = this.consume();
    
    if (verb.type === 'KW_ASSIGN' || verb.type === 'KW_DECLARE') {
      const target = components.length > 0 ? components[0].expr : null;
      let typeAnnotation = null;
      let init_val = null;
      for (const c of components) {
        if (c.role === "type_cast") typeAnnotation = { type: "TypeReference", name: c.type_val };
        else if (c.expr && c !== components[0]) init_val = c.expr;
      }
      
      const isConst = verb.value.includes('고정하자');
      const isDeclarationOnly = verb.type === 'KW_DECLARE';
      
      if (!isConst && !isDeclarationOnly && !typeAnnotation && target?.type === 'MemberExpression') {
        return { type: "Assignment", target, value: init_val };
      }
      
      return { 
        type: "VariableDeclaration", 
        target, 
        typeAnnotation, 
        value: isDeclarationOnly ? null : init_val, 
        isConst, 
        isDeclarationOnly 
      };
    } else if (verb.type === 'KW_ADD') {
      return { type: "MathAdd", target: components[0].expr, value: components[1].expr };
    } else if (verb.type === 'KW_SUB') {
      return { type: "MathSubtract", target: components[0].expr, value: components[1].expr };
    } else if (verb.type === 'KW_IMPORT') {
      return { type: "ImportStatement", module: components[0].expr };
    } else if (verb.type === 'KW_APPEND') {
      return { type: "ListAppend", target: components[0].expr, value: components[1].expr };
    } else if (verb.type === 'KW_PRINT') {
      return { type: "PrintStatement", value: components[0].expr };
    } else if (verb.type === 'KW_PRINT_INLINE') {
      return { type: "PrintInlineStatement", value: components[0].expr };
    } else if (verb.type === 'KW_INPUT') {
      let target = null;
      let typeAnnotation = null;
      for (const c of components) {
        if (c.role === "type_cast") typeAnnotation = { type: "TypeReference", name: c.type_val };
        else if (c.expr && !target) target = c.expr;
      }
      return { type: "InputStatement", target, typeAnnotation };
    } else if (verb.type === 'KW_RETURN') {
      return { type: "ReturnStatement", value: components.length > 0 ? components[0].expr : null };
    } else if (verb.type === 'KW_EXECUTE') {
      return { type: "ExpressionStatement", expression: components[0].expr };
    } else if (verb.type === 'KW_THROW') {
      return { type: "ThrowStatement", error: components[0].expr };
    } else if (verb.type === 'KW_FALLTHROUGH') {
      return { type: "FallthroughStatement" };
    } else if (verb.type === 'KW_SWITCH') {
      const target_expr = components[0].expr;
      this.consume('COLON');
      if (this.peek()?.type === 'INDENT') this.consume('INDENT');
      
      const cases = [];
      let default_block = null;
      
      while (this.peek() && this.peek()?.type !== 'DEDENT') {
        if (this.peek()?.type === 'KW_DEFAULT') {
          this.consume('KW_DEFAULT');
          const block = this.parse_block();
          default_block = block.body;
        } else {
          const case_vals = [];
          while (true) {
            case_vals.push(this.parse_expression());
            if (this.peek()?.type === 'COMMA') this.consume('COMMA');
            else if (this.peek()?.type === 'KW_CASE') {
              this.consume('KW_CASE');
              break;
            } else {
              throw new Error("SyntaxError: '일 때'를 찾을 수 없어요. (스위치 구문)");
            }
          }
          const block = this.parse_block();
          cases.push({ values: case_vals, body: block.body });
        }
      }
      if (this.peek()?.type === 'DEDENT') this.consume('DEDENT');
      return { type: "SwitchStatement", discriminant: target_expr, cases, default: default_block };
    } else if (verb.type === 'KW_WHILE') {
      const cond = components[0].expr;
      const block = this.parse_block();
      return { type: "WhileLoop", condition: cond, body: block.body };
    } else if (verb.type === 'KW_FOREACH') {
      const expr = components[0].expr;
      if (expr.type !== 'MemberExpression') {
        throw new HajaError("SyntaxError: 반복문은 '배열(목록)'의 '항목'마다 반복하자 형식이어야 해요.", verb.line, verb.col);
      }
      const block = this.parse_block();
      return { type: "ForEachLoop", iterable: expr.object, item: expr.property, body: block.body };
    }
    return null;
  }
}
