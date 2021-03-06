import { IAjaxProvider, QueryParameter } from "jinqu";
import { QueryOptions, LinqService } from "linquest";
import { ODataQueryProvider } from "./odata-query-provider";

export class ODataService extends LinqService {

    constructor(baseAddress = '', ajaxProvider?: IAjaxProvider) {
        super(baseAddress, ajaxProvider);
    }

    request<TResult>(params: QueryParameter[], options: QueryOptions[]): PromiseLike<TResult> {
        return super.request(params, options).then(d => {
            const v = d && d['value'];
            return v != null ? v : d;
        });
    }

    createQuery<T>(url: string) {
        return new ODataQueryProvider<QueryOptions>(this).createQuery<T>().withOptions({ url });
    }
}
