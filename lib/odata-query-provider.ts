import {
    ExpressionType, Expression,
    LiteralExpression, VariableExpression, UnaryExpression,
    GroupExpression, AssignExpression, ObjectExpression, ArrayExpression,
    BinaryExpression, MemberExpression, IndexerExpression, FuncExpression,
    CallExpression, TernaryExpression
} from 'jokenizer';
import { IQueryPart, QueryParameter, IRequestProvider } from "jinqu";
import { LinqQuery, QueryOptions, LinqQueryProvider } from "linquest";

const supportedPrms = ['where', 'orderBy', 'skip', 'take'];

export class ODataQueryProvider<TOptions extends QueryOptions> extends LinqQueryProvider<TOptions> {

    constructor(requestProvider: IRequestProvider<TOptions>) {
        super(requestProvider);
    }

    createQuery<T>(parts?: IQueryPart[]): LinqQuery<T, TOptions> {
        return new LinqQuery<T, TOptions>(this, parts);
    }

    handlePart(part: IQueryPart): QueryParameter {
        if (~supportedPrms.indexOf(part.type))
            throw new Error(`${part.type} is not supported.`);
        
        const retVal = super.handlePart(part);
        if (part.type === 'where') {
            retVal.key = "$filter";
        }

        return retVal;
    }

    memberToStr(exp: MemberExpression, scopes: any[], parameters: string[]) {
        const member = this.pascalize
            ? exp.name[0].toUpperCase() + exp.name.substr(1)
            : exp.name;
        return `${this.expToStr(exp.owner, scopes, parameters)}/${member}`;
    }

    binaryToStr(exp: BinaryExpression, scopes: any[], parameters: string[]) {
        const left = this.expToStr(exp.left, scopes, parameters);
        const op = getBinaryOp(exp.operator);
        const right = this.expToStr(exp.right, scopes, parameters);

        return `${left} ${op} ${right}`;
    }

    unaryToStr(exp: UnaryExpression, scopes: any[], parameters: string[]) {
        return `${getUnaryOp(exp.operator)}${this.expToStr(exp.target, scopes, parameters)}`;
    }

    funcToStr(exp: FuncExpression, scopes: any[], parameters: string[]) {
        const prm = exp.parameters.length == 1 ? exp.parameters[0] : `(${exp.parameters.join(', ')})`;
        return prm + ': ' + this.expToStr(exp.body, scopes, [...exp.parameters, ...parameters]);
    }

    callToStr(exp: CallExpression, scopes: any[], parameters: string[]) {
        const callee = exp.callee as VariableExpression;
        if (callee.type !== ExpressionType.Member && callee.type !== ExpressionType.Variable)
            throw new Error(`Invalid function call ${this.expToStr(exp.callee, scopes, parameters)}`);

        const args = exp.args.map(a => this.expToStr(a, scopes, parameters));
        if (callee.type === ExpressionType.Member) {
            args.unshift(this.expToStr((callee as MemberExpression).owner, scopes, parameters));
        }
  
        return `${callee.name}(${args.join(', ')})`;
    }

    valueToStr(value) {
        if (Object.prototype.toString.call(value) === '[object Date]')
            return `"datetime'${value.toISOString()}'"`;

        return super.valueToStr(value);
    }
}

function getBinaryOp(op: string) {
    if (op === '==' || op === '===') return 'eq';
    if (op === '!=' || op === '!==') return 'ne';
    if (op === '>') return 'gt';
    if (op === '>=') return 'ge';
    if (op === '<') return 'lt';
    if (op === '>=') return 'le';
    if (op === '+') return 'add';
    if (op === '-') return 'sub';
    if (op === '*') return 'mul';
    if (op === '/') return 'div';
    if (op === '%') return 'mod';
    if (op === '&&') return 'and';
    if (op === '||') return 'or';

    return op;
}

function getUnaryOp(op) {
    if (op === '!') return 'not';

    return op;
}
