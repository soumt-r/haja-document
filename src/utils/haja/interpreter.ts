import { HajaRuntimeError, BreakLoop, ReturnValue, type ASTNode } from './types';
import { Lexer } from './lexer';
import { Parser } from './parser';

export class Environment {
  parent: Environment | null;
  vars: Record<string, any>;
  constants: Set<string>;
  
  constructor(parent: Environment | null = null) {
    this.parent = parent;
    this.vars = {};
    this.constants = new Set();
  }

  declare(name: string, value: any, isConst: boolean = false) {
    if (this.vars[name] !== undefined) {
      if (this.constants.has(name)) {
        throw new Error(`ConstantAssignmentError: 상수 '${name}'의 값은 바꿀 수 없어요.`);
      }
    }
    this.vars[name] = value;
    if (isConst) this.constants.add(name);
  }
  
  assign(name: string, value: any) {
    if (this.constants.has(name)) {
      throw new Error(`ConstantAssignmentError: 상수 '${name}'의 값은 바꿀 수 없어요.`);
    }
    if (this.vars[name] !== undefined) {
      this.vars[name] = value;
      return;
    }
    if (this.parent) {
      this.parent.assign(name, value);
      return;
    }
    throw new Error(`ReferenceError: 아직 준비되지 않은 변수 '${name}'에 값을 넣으려고 했어요.`);
  }

  get(name: string): any {
    let env: Environment | null = this;
    while (env) {
      if (name in env.vars) {
        return env.vars[name];
      }
      env = env.parent;
    }
    return undefined;
  }
  
  getOuter(name: string): any {
    if (this.parent) {
      return this.parent.get(name);
    }
    return undefined;
  }
  
  assignOuter(name: string, value: any) {
    if (this.parent) {
      this.parent.assign(name, value);
    } else {
      throw new Error(`ReferenceError: 바깥 범위에서 '${name}'(을)를 찾을 수 없어요.`);
    }
  }
  
  has(name: string): boolean {
    let env: Environment | null = this;
    while (env) {
      if (name in env.vars) return true;
      env = env.parent;
    }
    return false;
  }
}

export class HajaObject {
  cls_name: string;
  props: Record<string, any>;

  constructor(cls_name: string) {
    this.cls_name = cls_name;
    this.props = {};
  }

  toString() {
    return `[${this.cls_name} 객체]`;
  }
}

export class HajaInterpreter {
  ast: ASTNode;
  env: Environment;
  classes: Record<string, ASTNode>;
  interfaces: Record<string, ASTNode>;
  functions: Record<string, ASTNode>;
  output: string[];
  inline_buffer: string;
  inputCallback?: (promptText: string) => Promise<string>;

  outputCallback?: (msg: string) => void;
  constructor(ast: ASTNode, inputCallback?: (promptText: string) => Promise<string>, outputCallback?: (msg: string) => void) {
    this.outputCallback = outputCallback;
    this.inputCallback = inputCallback;
    this.ast = ast;
    this.env = new Environment();
    this.classes = {};
    this.interfaces = {};
    this.functions = {};
    this.output = [];
    this.inline_buffer = "";
  }

  async run(): Promise<string> {
    for (const stmt of this.ast.body) {
      if (stmt.type === 'ClassDeclaration') {
        this.classes[stmt.id] = stmt;
      } else if (stmt.type === 'InterfaceDeclaration') {
        this.interfaces[stmt.id] = stmt;
      } else if (stmt.type === 'FunctionDeclaration') {
        this.functions[stmt.id] = stmt;
      }
    }

    // Verify Interfaces
    for (const clsName in this.classes) {
      const cls = this.classes[clsName];
      for (const ifaceName of (cls.interfaces || [])) {
        const iface = this.interfaces[ifaceName];
        if (!iface) throw new HajaRuntimeError(`InterfaceImplementationError: 인터페이스 '${ifaceName}'를 찾을 수 없어요.`, cls.line);
        for (const req of iface.body) {
          if (req.type === 'InterfaceMethod') {
            const hasMethod = cls.body.some((s: any) => s.type === 'FunctionDeclaration' && s.id === req.id);
            if (!hasMethod) throw new HajaRuntimeError(`InterfaceImplementationError: 클래스 '${cls.id}'는 약속된 '${req.id}' 기능을 꼭 만들어야 해요.`, cls.line);
          }
        }
      }
    }

    for (const stmt of this.ast.body) {
      if (!['ClassDeclaration', 'InterfaceDeclaration', 'FunctionDeclaration'].includes(stmt.type)) {
        await this.execute(stmt, this.env);
      }
    }
    
    if (this.inline_buffer !== "") {
      this.output.push(this.inline_buffer);
    }
    return this.output.join("\n");
  }

  format_value(val: any): string {
    if (val === null || val === undefined) return "비어있음";
    if (typeof val === 'boolean') return val ? "참" : "거짓";
    if (Array.isArray(val)) return "[" + val.map(v => this.format_value(v)).join(", ") + "]";
    if (typeof val === 'object' && !(val instanceof HajaObject)) {
      const entries = Object.entries(val).map(([k, v]) => `"${k}": ${this.format_value(v)}`);
      return "{" + entries.join(", ") + "}";
    }
    return String(val);
  }

  async execute(stmt: ASTNode, env: Environment): Promise<any> {
    try {
      return await this._do_execute(stmt, env);
    } catch (e: any) {
      if (e.name === 'ReturnValue' || e.name === 'HajaRuntimeError' || e.name === 'BreakLoop') {
        throw e;
      }
      const line = stmt.line || '?';
      throw new HajaRuntimeError(`[${line}번째 줄] ${e.message || String(e)}`, line as number);
    }
  }

  async _do_execute(stmt: ASTNode, env: Environment): Promise<any> {
    const t = stmt.type;

    if (t === 'VariableDeclaration') {
      const val = stmt.value ? await this.evaluate(stmt.value, env) : null;
      if (stmt.target.type === 'Identifier') {
        env.declare(stmt.target.name, val, stmt.isConst || false);
      }
    } else if (t === 'Assignment') {
      const val = stmt.value ? await this.evaluate(stmt.value, env) : null;
      const tgt = stmt.target;
      if (tgt.type === 'Identifier') {
        env.assign(tgt.name, val);
      } else if (tgt.type === 'MemberExpression') {
        if (tgt.object.type === 'OuterReference') {
          env.assignOuter(tgt.property.name, val);
          return;
        }
        const obj = await this.evaluate(tgt.object, env);
        if (obj instanceof HajaObject) {
          obj.props[tgt.property.name] = val;
        } else if (Array.isArray(obj)) {
          let idx = -1;
          if (tgt.property.type === 'IndexLiteral') idx = tgt.property.value - 1;
          else if (tgt.property.type === 'IndexExpression') idx = await this.evaluate(tgt.property.index, env) - 1;
          else if (tgt.property.type === 'Literal') idx = await this.evaluate(tgt.property, env);
          
          if (idx !== -1) {
            if (t === 'Assignment') obj[idx] = val;
            else if (t === 'MathAdd') obj[idx] = (obj[idx] || 0) + val;
            else if (t === 'MathSubtract') obj[idx] = (obj[idx] || 0) - val;
          }
        } else if (obj !== null && typeof obj === 'object') {
          if (tgt.property.type === 'Literal') obj[await this.evaluate(tgt.property, env)] = val;
          else if (tgt.property.type === 'Identifier') obj[tgt.property.name] = val;
        }
      }
    } else if (t === 'ExpressionStatement') {
      await this.evaluate(stmt.expression, env);
    } else if (t === 'PrintStatement') {
      const val = this.format_value(await this.evaluate(stmt.value, env));
      const line = this.inline_buffer + val;
      this.output.push(line);
      if (this.outputCallback) this.outputCallback(line + "\n");
      this.inline_buffer = "";
    } else if (t === 'PrintInlineStatement') {
      const val = this.format_value(await this.evaluate(stmt.value, env));
      this.inline_buffer += val;
      if (this.outputCallback) this.outputCallback(val);
    } else if (t === 'InputStatement') {
      const target = stmt.target.name;
      const typeAnn = stmt.typeAnnotation ? stmt.typeAnnotation.name : '문자열';
      let user_input = "";
      if (this.inputCallback) {
        user_input = await this.inputCallback("") || "";
      } else {
        user_input = prompt(`입력 (${typeAnn}): `) || "";
      }

      this.inline_buffer = "";
      
      let val: any = user_input;
      if (typeAnn === '숫자') {
         val = Number(user_input);
         if (isNaN(val)) val = 0;
      } else if (typeAnn === '논리') {
         val = (user_input === '참' || user_input === 'true');
      }
      try {
        env.assign(target, val);
      } catch (e) {
        env.declare(target, val, false);
      }
    } else if (t === 'MathAdd') {
      const tgt = stmt.target;
      const val = await this.evaluate(stmt.value, env);
      if (tgt.type === 'Identifier') {
        env.assign(tgt.name, (env.get(tgt.name) || 0) + val);
      } else if (tgt.type === 'MemberExpression') {
        if (tgt.object.type === 'OuterReference') {
          env.assignOuter(tgt.property.name, (env.getOuter(tgt.property.name) || 0) + val);
          return;
        }
        const obj = await this.evaluate(tgt.object, env);
        if (obj instanceof HajaObject) {
          obj.props[tgt.property.name] = (obj.props[tgt.property.name] || 0) + val;
        } else if (Array.isArray(obj)) {
          let idx = -1;
          if (tgt.property.type === 'IndexLiteral') idx = tgt.property.value - 1;
          else if (tgt.property.type === 'IndexExpression') idx = await this.evaluate(tgt.property.index, env) - 1;
          else if (tgt.property.type === 'Literal') idx = await this.evaluate(tgt.property, env);
          
          if (idx !== -1) obj[idx] = (obj[idx] || 0) + val;
        } else if (obj !== null && typeof obj === 'object') {
          if (tgt.property.type === 'Literal') obj[await this.evaluate(tgt.property, env)] = (obj[await this.evaluate(tgt.property, env)] || 0) + val;
          else if (tgt.property.type === 'Identifier') obj[tgt.property.name] = (obj[tgt.property.name] || 0) + val;
        }
      }
    } else if (t === 'MathSubtract') {
      const tgt = stmt.target;
      const val = await this.evaluate(stmt.value, env);
      if (tgt.type === 'Identifier') {
        env.assign(tgt.name, (env.get(tgt.name) || 0) - val);
      } else if (tgt.type === 'MemberExpression') {
        if (tgt.object.type === 'OuterReference') {
          env.assignOuter(tgt.property.name, (env.getOuter(tgt.property.name) || 0) - val);
          return;
        }
        const obj = await this.evaluate(tgt.object, env);
        if (obj instanceof HajaObject) {
          obj.props[tgt.property.name] = (obj.props[tgt.property.name] || 0) - val;
        } else if (Array.isArray(obj)) {
          let idx = -1;
          if (tgt.property.type === 'IndexLiteral') idx = tgt.property.value - 1;
          else if (tgt.property.type === 'IndexExpression') idx = await this.evaluate(tgt.property.index, env) - 1;
          else if (tgt.property.type === 'Literal') idx = await this.evaluate(tgt.property, env);
          
          if (idx !== -1) obj[idx] = (obj[idx] || 0) - val;
        } else if (obj !== null && typeof obj === 'object') {
          if (tgt.property.type === 'Literal') obj[await this.evaluate(tgt.property, env)] = (obj[await this.evaluate(tgt.property, env)] || 0) - val;
          else if (tgt.property.type === 'Identifier') obj[tgt.property.name] = (obj[tgt.property.name] || 0) - val;
        }
      }
    } else if (t === 'ListAppend') {
      const tgt = stmt.target;
      const val = await this.evaluate(stmt.value, env);
      if (tgt.type === 'Identifier') {
        let arr = env.get(tgt.name);
        if (!arr) { arr = []; env.assign(tgt.name, arr); }
        arr.push(val);
      } else if (tgt.type === 'MemberExpression') {
        if (tgt.object.type === 'OuterReference') {
          let arr = env.getOuter(tgt.property.name);
          if (!arr) { arr = []; env.assignOuter(tgt.property.name, arr); }
          arr.push(val);
          return;
        }
        const obj = await this.evaluate(tgt.object, env);
        if (obj instanceof HajaObject) {
          if (!obj.props[tgt.property.name]) obj.props[tgt.property.name] = [];
          obj.props[tgt.property.name].push(val);
        } else if (obj !== null && typeof obj === 'object') {
          if (tgt.property.type === 'Literal') {
            const key = await this.evaluate(tgt.property, env);
            if (!obj[key]) obj[key] = [];
            obj[key].push(val);
          } else if (tgt.property.type === 'Identifier') {
            if (!obj[tgt.property.name]) obj[tgt.property.name] = [];
            obj[tgt.property.name].push(val);
          }
        }
      }
    } else if (t === 'ImportStatement') {
      // For web playground, we just ignore imports or throw unsupported
      throw new Error("웹 놀이터에서는 외부 파일(모듈) 가져오기를 아직 지원하지 않아요.");
    } else if (t === 'IfStatement') {
      const cond = await this.evaluate(stmt.condition, env);
      let executed = false;
      if (cond) {
        for (const bs of stmt.consequent) await this.execute(bs, env);
        executed = true;
      } else if (stmt.elifs && stmt.elifs.length > 0) {
        for (const elif of stmt.elifs) {
          if (await this.evaluate(elif.condition, env)) {
            for (const bs of elif.consequent) await this.execute(bs, env);
            executed = true;
            break;
          }
        }
      }
      
      if (!executed && stmt.alternate) {
        for (const bs of stmt.alternate) await this.execute(bs, env);
      }
    } else if (t === 'TryStatement') {
      try {
        for (const s of stmt.block) await this.execute(s, env);
      } catch (e: any) {
        if (e.name === 'ReturnValue') throw e;
        let msg = e.message || String(e);
        msg = msg.replace(/^\[\d+번째 줄\]\s*/, '');
        if (stmt.handler) {
          const catch_env = new Environment(env);
          catch_env.declare(stmt.handler.param.name || stmt.handler.param, msg, false);
          for (const s of stmt.handler.body) await this.execute(s, catch_env);
        }
      } finally {
        if (stmt.finalizer) {
          for (const s of stmt.finalizer) await this.execute(s, env);
        }
      }
    } else if (t === 'ForRangeStatement') {
      const start = parseInt(await this.evaluate(stmt.start, env), 10);
      const end = parseInt(await this.evaluate(stmt.end, env), 10);
      for (let i = start; i <= end; i++) {
        const loop_env = new Environment(env);
        loop_env.declare(stmt.iterator, i, false);
        try {
          for (const s of stmt.body) await this.execute(s, loop_env);
        } catch (e: any) {
          if (e.name === 'BreakLoop') break;
          throw e;
        }
      }
    } else if (t === 'SwitchStatement') {
      const disc = await this.evaluate(stmt.discriminant, env);
      let matched = false;
      let fallthrough = false;
      
      for (const case_ast of stmt.cases) {
        if (!matched && !fallthrough) {
          for (const val_ast of case_ast.values) {
            if (await this.evaluate(val_ast, env) === disc) {
              matched = true;
              break;
            }
          }
        }
        
        if (matched || fallthrough) {
          fallthrough = false;
          for (const s of case_ast.body) {
            if (s.type === 'FallthroughStatement') {
              fallthrough = true;
              break;
            }
            const ret = await this.execute(s, env);
            if (ret !== undefined) return ret;
          }
          if (!fallthrough) break;
        }
      }
      
      if ((!matched || fallthrough) && stmt.default) {
        for (const s of stmt.default) {
          const ret = await this.execute(s, env);
          if (ret !== undefined) return ret;
        }
      }
    } else if (t === 'WhileLoop') {
      while (await this.evaluate(stmt.condition, env)) {
        const loop_env = new Environment(env);
        try {
          for (const s of stmt.body) await this.execute(s, loop_env);
        } catch (e: any) {
          if (e.name === 'BreakLoop') break;
          throw e;
        }
      }
    } else if (t === 'ForEachLoop') {
        const iterable = await this.evaluate(stmt.iterable, env);
        if (!Array.isArray(iterable)) throw new Error("TypeError: 반복할 수 있는 목록이나 사전이 아니에요.");
      for (const item of iterable) {
        const loop_env = new Environment(env);
        loop_env.declare(stmt.item.name, item, false);
        try {
          for (const s of stmt.body) await this.execute(s, loop_env);
        } catch (e: any) {
          if (e.name === 'BreakLoop') break;
          throw e;
        }
      }
    } else if (t === 'BreakStatement') {
      throw new BreakLoop();
    } else if (t === 'ThrowStatement') {
      const err_obj = await this.evaluate(stmt.error, env);
      const msg = err_obj instanceof HajaObject ? (err_obj.props['메시지'] || '알 수 없는 오류') : String(err_obj);
      throw new Error(msg);
    } else if (t === 'ReturnStatement') {
      const val = stmt.value ? await this.evaluate(stmt.value, env) : null;
      throw new ReturnValue(val);
    }
  }

  async evaluate(expr: ASTNode, env: Environment): Promise<any> {
    const t = expr.type;
    
    if (t === 'Literal') {
      let v = expr.value;
      if (v.startsWith('"') && v.endsWith('"')) {
        try {
          return JSON.parse(v);
        } catch {
          return v.slice(1, -1);
        }
      }
      if (v === '참') return true;
      if (v === '거짓') return false;
      if (v.includes('.')) return parseFloat(v);
      if (/^\d+$/.test(v)) return parseInt(v, 10);
      return v;
    } else if (t === 'Identifier') {
      if (expr.name === '나' && env.has('this')) return env.get('this');
      if (expr.name === '부모' && env.has('this')) return { type: "SuperReference", object: env.get('this') };
      return env.get(expr.name);
    } else if (t === 'ListLiteral') {
      const _els = [];
      for (const el of (expr.elements || [])) {
        _els.push(await this.evaluate(el, env));
      }
      return _els;
    } else if (t === 'DictLiteral') {
      const obj: Record<string, any> = {};
      for (const prop of expr.elements) {
        const key = await this.evaluate(prop.key, env);
        const val = await this.evaluate(prop.value, env);
        obj[key] = val;
      }
      return obj;
    } else if (t === 'Identifier') {
      if (expr.name === '나' && env.has('this')) return env.get('this');
      if (expr.name === '부모' && env.has('this')) return { type: "SuperReference", object: env.get('this') };
      return env.get(expr.name);
    } else if (t === 'OuterReference') {
      return { type: "OuterReference" };
    } else if (t === 'TypeLiteral') {
      return expr.name;
    } else if (t === 'FunctionReference') {
      return expr.name;
    } else if (t === 'SuperReference') {
      if (!env.has('this')) throw new Error("SuperReferenceError: 부모를 찾을 수 없는 곳에서 부모를 불렀어요.");
      return { type: "SuperReference", object: env.get('this') };
    } else if (t === 'TemplateLiteral') {
      let res = "";
      for (let i = 0; i < expr.quasis.length; i++) {
        res += expr.quasis[i];
        if (i < expr.expressions.length) {
          res += String(await this.evaluate(expr.expressions[i], env));
        }
      }
      return res;
    } else if (t === 'NewExpression') {
      const cls = expr.class;
      const obj = new HajaObject(cls);
      
      const init_props = async (cname: string) => {
        const cast = this.classes[cname];
        if (!cast) return;
        if (cast.baseClass) await init_props(cast.baseClass);
        for (const s of cast.body) {
          if (s.type === 'VariableDeclaration' || s.type === 'Assignment') {
            obj.props[s.target.name] = s.value ? await this.evaluate(s.value, env) : null;
          }
        }
      };
      await init_props(cls);
      
      if (cls === '오류' && expr.arguments.length > 0) {
        obj.props['메시지'] = await this.evaluate(expr.arguments[0], env);
      }
      
      const fake_callee = { type: "BoundMethod", object: obj, func_name: "처음 만들어질 때" };
      await this.evaluate({ type: "CallExpression", callee: fake_callee, arguments: expr.arguments, is_fake: true }, env);
      return obj;
    } else if (t === 'MemberExpression') {
      if (expr.object.type === 'OuterReference') {
        return env.getOuter(expr.property.name);
      }
      const obj = await this.evaluate(expr.object, env);
      if (obj && typeof obj === 'object' && obj.type === 'SuperReference') {
        return { type: "BoundMethod", object: obj.object, func_name: expr.property.name, is_super: true };
      }
      if (obj instanceof HajaObject) {
        if (expr.property.type === 'FunctionReference') {
          return { type: "BoundMethod", object: obj, func_name: expr.property.name };
        }
        return obj.props[expr.property.name];
      }
      if (Array.isArray(obj)) {
        if (expr.property.type === 'LengthLiteral') return obj.length;
        
        let idx = -1;
        if (expr.property.type === 'IndexLiteral') idx = expr.property.value - 1;
        else if (expr.property.type === 'IndexExpression') idx = await this.evaluate(expr.property.index, env) - 1;
        else if (expr.property.type === 'Literal') idx = await this.evaluate(expr.property, env);
        
        if (idx !== -1) {
          if (typeof idx === 'number' && (idx < 0 || idx >= obj.length)) throw new Error("IndexOutOfBoundsError: 목록의 길이를 벗어난 위치(인덱스)예요.");
          return obj[idx];
        }
      }
      if (obj !== null && typeof obj === 'object') {
        if (expr.property.type === 'Literal') {
          const key = await this.evaluate(expr.property, env);
          if (!(key in obj)) throw new Error(`KeyError: 사전에서 '${key}' 이름을 찾을 수 없어요.`);
          return obj[key];
        }
        if (expr.property.type === 'Identifier') {
          const key = expr.property.name;
          if (!(key in obj)) throw new Error(`KeyError: 사전에서 '${key}' 이름을 찾을 수 없어요.`);
          return obj[key];
        }
      }
    } else if (t === 'CallExpression') {
      const callee = expr.is_fake ? expr.callee : await this.evaluate(expr.callee, env);
      
      if (callee && typeof callee === 'object' && callee.type === 'BoundMethod') {
        const obj = callee.object;
        const fname = callee.func_name;
        const is_super = callee.is_super || false;
        
        const find_and_run = async (cname: string, skip_cur: boolean): Promise<[boolean, any]> => {
          const cast = this.classes[cname];
          if (!cast) return [false, null];
          
          if (!skip_cur) {
            for (const s of cast.body) {
              if ((s.type === 'FunctionDeclaration' && s.id === fname) || (s.type === 'ConstructorDeclaration' && fname === '처음 만들어질 때')) {
                if (s.accessModifier === 'private' && !expr.is_fake) {
                  if (env.get('this') !== obj) throw new Error(`AccessViolationError: '${fname}' 기능은 내부 전용(private)이라 외부에서 부를 수 없어요.`);
                }
                if (s.accessModifier === 'protected' && !expr.is_fake) {
                  if (!env.has('this')) throw new Error(`AccessViolationError: '${fname}' 기능은 상속된 클래스 전용(protected)이라 외부에서 부를 수 없어요.`);
                }
                
                const local_env = new Environment(env);
                local_env.declare('this', obj, false);
                const params = s.params || [];
                if (expr.arguments.length > params.length) throw new Error("ArgumentError: 함수에 전달된 인자의 개수가 너무 많아요.");
                for (let i = 0; i < params.length; i++) {
                  if (i < expr.arguments.length) {
                    local_env.declare(params[i].name, await this.evaluate(expr.arguments[i], env), false);
                  } else if (params[i].default) {
                    local_env.declare(params[i].name, await this.evaluate(params[i].default, env), false);
                  } else {
                    throw new Error("MissingArgumentError: 함수 실행에 필요한 인자가 누락되었어요.");
                  }
                }
                try {
                  for (const bs of s.body) await this.execute(bs, local_env);
                } catch (e: any) {
                  if (e.name === 'ReturnValue') return [true, e.value];
                  throw e;
                }
                return [true, null];
              }
            }
          }
          
          if (cast.baseClass) {
            const [found, val] = await find_and_run(cast.baseClass, false);
            if (found) return [true, val];
          }
          return [false, null];
        };
        
        const [found, val] = await find_and_run(obj.cls_name, is_super);
        return val;
      } else if (typeof callee === 'string' && this.functions[callee]) {
        const func_decl = this.functions[callee];
        if (func_decl.type === 'BuiltinFunction') {
          const args = [];
          for (const a of expr.arguments) {
            args.push(await this.evaluate(a, env));
          }
          return func_decl.execute(args);
        }
        
        const local_env = new Environment(env);
        const params = func_decl.params || [];
        if (expr.arguments.length > params.length) throw new Error("ArgumentError: 함수에 전달된 인자의 개수가 너무 많아요.");
        for (let i = 0; i < params.length; i++) {
          if (i < expr.arguments.length) {
            local_env.declare(params[i].name, await this.evaluate(expr.arguments[i], env), false);
          } else if (params[i].default) {
            local_env.declare(params[i].name, await this.evaluate(params[i].default, env), false);
          } else {
            throw new Error("MissingArgumentError: 함수 실행에 필요한 인자가 누락되었어요.");
          }
        }
        try {
          for (const bs of func_decl.body) await this.execute(bs, local_env);
        } catch (e: any) {
          if (e.name === 'ReturnValue') return e.value;
          throw e;
        }
        return null;
      }
    } else if (t === 'BinaryExpression') {
      const l = await this.evaluate(expr.left, env);
      const r = await this.evaluate(expr.right, env);
      const op = expr.operator;
      if (op === '==') return l === r;
      if (op === '!=') return l !== r;
      if (op === '>') return l > r;
      if (op === '<') return l < r;
      if (op === '>=') return l >= r;
      if (op === '<=') return l <= r;
      if (op === '+') return l + r;
      if (op === '*') return l * r;
      if (op === '-') return l - r;
      if (op === 'instanceof') {
        if (typeof r === 'string') {
          if (r === '문자열') return typeof l === 'string';
          if (r === '숫자') return typeof l === 'number';
          if (r === '논리') return typeof l === 'boolean';
          if (r === '목록' || r === '배열') return Array.isArray(l);
          if (r === '사전') return l !== null && typeof l === 'object' && !Array.isArray(l) && !(l instanceof HajaObject);
          if (l instanceof HajaObject) {
            let clsName: string | null = l.cls_name;
            while (clsName) {
              if (clsName === r) return true;
              const cls: any = this.classes[clsName];
              if (cls && cls.interfaces && cls.interfaces.includes(r)) return true;
              clsName = cls ? cls.baseClass : null;
            }
          }
          return false;
        }
        return false;
      }
    } else if (t === 'LogicalExpression') {
      const l = await this.evaluate(expr.left, env);
      const op = expr.operator;
      if (op === '그리고') {
        if (!l) return false;
        return await this.evaluate(expr.right, env);
      } else if (op === '또는') {
        if (l) return true;
        return await this.evaluate(expr.right, env);
      }
    }
    return null;
  }
}
