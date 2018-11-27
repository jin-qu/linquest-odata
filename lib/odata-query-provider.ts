import {
    ExpressionType, Expression,
    LiteralExpression, VariableExpression, UnaryExpression,
    GroupExpression, AssignExpression, ObjectExpression, ArrayExpression,
    BinaryExpression, MemberExpression, IndexerExpression, FuncExpression,
    CallExpression, TernaryExpression
} from 'jokenizer';
import { IQueryPart, QueryParameter, IRequestProvider, QueryPart, QueryFunc, AjaxFuncs } from "jinqu";
import { LinqQuery, QueryOptions, LinqQueryProvider } from "linquest";

const orderFuncs = [QueryFunc.orderBy, QueryFunc.orderByDescending, QueryFunc.thenBy, QueryFunc.thenByDescending];
const supportedFuncs = [QueryFunc.where, QueryFunc.select, QueryFunc.skip, QueryFunc.take, QueryFunc.inlineCount]
    .concat(orderFuncs);
const mathFuncs = ['round', 'floor', 'ceiling'];

export class ODataQueryProvider<TOptions extends QueryOptions> extends LinqQueryProvider<TOptions> {

    constructor(requestProvider: IRequestProvider<TOptions>) {
        super(requestProvider);
    }

    private rootLambda = true;

    createQuery<T>(parts?: IQueryPart[]): LinqQuery<T, TOptions> {
        return new LinqQuery<T, TOptions>(this, parts);
    }

    executeAsync<T = any, TResult = T[]>(parts: IQueryPart[]): PromiseLike<TResult> {
        const params: IQueryPart[] = [];
        const options: TOptions[] = [];

        for (let part of parts) {
            if (part.type === AjaxFuncs.options) {
                const o: TOptions = part.args[0].literal;
                options.push(o);

                if (o && o.pascalize != null) {
                    this.pascalize = o.pascalize;
                }
            }
            else if (part.type === QueryFunc.toArray) continue;
            else {
                params.push(part);
            }
        }

        const queryParams: QueryParameter[] = [];
        let os: IQueryPart[] = [];

        const that = this;
        function handleOrders() {
            if (os.length) {
                queryParams.push({
                    key: '$orderby',
                    value: os.map(o => {
                        that.rootLambda = true;
                        const ord = that.handlePart(o).value;
                        return o.type.endsWith('Descending') ? ord + ' desc' : ord;
                    }).join(', ')
                });
                os = [];
            }
        }

        for (let p of params) {
            if (~orderFuncs.indexOf(p.type)) {
                os.push(p);
                continue;
            }

            handleOrders();

            this.rootLambda = true;
            queryParams.push(this.handlePart(p));
        }
        handleOrders();

        return this.requestProvider.request<TResult>(queryParams, options);
    }

    handlePart(part: IQueryPart): QueryParameter {
        if (!~supportedFuncs.indexOf(part.type))
            throw new Error(`${part.type} is not supported.`);

        if (part.type === QueryFunc.inlineCount) {
            return {
                key: '$inlinecount',
                value: part.args[0].literal !== false ? 'allpages' : ''
            };
        }

        const retVal = super.handlePart(part);
        if (part.type === QueryFunc.where)
            retVal.key = part.type === QueryFunc.where ? '$filter' : retVal.key.toLowerCase();

        return retVal;
    }

    variableToStr(exp: VariableExpression, scopes: any[], parameters: string[]) {
        const name = exp.name;
        if (~parameters.indexOf(name)) return '';

        const s = scopes && scopes.find(s => name in s);
        return (s && this.valueToStr(s[name])) || name;
    }

    memberToStr(exp: MemberExpression, scopes: any[], parameters: string[]) {
        const owner = this.expToStr(exp.owner, scopes, parameters);
        if (exp.name === 'length')
            return `length(${owner})`;

        const member = this.pascalize
            ? exp.name[0].toUpperCase() + exp.name.substr(1)
            : exp.name;

        return owner ? `${owner}/${member}` : member;
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

    objectToStr(exp: ObjectExpression, scopes: any[], parameters: string[]) {
        return exp.members.map(m => {
            const ae = m as AssignExpression;
            return `${ae.name} as ${this.expToStr(ae.right, scopes, parameters)}`;
        }).join(', ');
    }

    funcToStr(exp: FuncExpression, scopes: any[], parameters: string[]) {
        const rl = this.rootLambda;
        this.rootLambda = false;
        const prm = rl ? '' : (exp.parameters.join(', ') + ': ');
        const body = this.expToStr(exp.body, scopes, parameters);
        return prm + body;
    }

    callToStr(exp: CallExpression, scopes: any[], parameters: string[]) {
        const callee = exp.callee as VariableExpression;
        if (callee.type !== ExpressionType.Member && callee.type !== ExpressionType.Variable)
            throw new Error(`Invalid function call ${this.expToStr(exp.callee, scopes, parameters)}`);

        let args = exp.args.map(a => this.expToStr(a, scopes, parameters)).join(', ');
        if (callee.type === ExpressionType.Member) {
            const member = callee as MemberExpression;
            const ownerStr = this.expToStr(member.owner, scopes, parameters);

            // handle Math functions
            if (~mathFuncs.indexOf(callee.name) && ownerStr === 'Math')
                return `${callee.name}(${args})`;
            // substringof is the only function where owner is the second parameter
            if (callee.name === 'includes')
                return `substringof(${args}, ${ownerStr})`;
            // any and all are the only functions which can be called on owner
            if (callee.name === 'any' || callee.name === 'all')
                return `${ownerStr}/${callee.name}(${args})`;

            // other supported functions takes owner as the first argument`
            args = args ? `${ownerStr}, ${args}` : ownerStr;
        }

        const oDataFunc = functions[callee.name] || callee.name;
        return `${oDataFunc}(${args})`;
    }

    valueToStr(value) {
        if (Object.prototype.toString.call(value) === '[object Date]')
            return `"datetime'${value.toISOString()}'"`;

        return super.valueToStr(value);
    }
}

function getBinaryOp(op: string) {
    switch (op) {
        case '==': case '===': return 'eq';
        case '!=': case '!==': return 'ne';
        case '>': return 'gt';
        case '>=': return 'ge';
        case '<': return 'lt';
        case '>=': return 'le';
        case '+': return 'add';
        case '-': return 'sub';
        case '*': return 'mul';
        case '/': return 'div';
        case '%': return 'mod';
        case '&&': return 'and';
        case '||': return 'or';
        default: return op;
    }
}

function getUnaryOp(op) {
    if (op === '!') return 'not';

    return op;
}

const functions = {
    'endsWith': 'endswith',
    'startsWith': 'startswith',
    'indexOf': 'indexof',
    'replace': 'replace',
    'substr': 'substring',
    'toLowerCase': 'tolower',
    'toUpperCase': 'toupper',
    'trim': 'trim',
    'concat': 'concat',
    'getDate': 'day',
    'getHours': 'hour',
    'getMinutes': 'minute',
    'getMonth': 'month',
    'getSeconds': 'second',
    'getFullYear': 'year'
};
