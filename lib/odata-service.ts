import { IAjaxProvider } from "jinqu";
import { QueryOptions, LinqService } from "linquest";
import { ODataQueryProvider } from "./odata-query-provider";

export class ODataService extends LinqService {

    constructor(baseAddress = '', ajaxProvider?: IAjaxProvider) {
        super(baseAddress, ajaxProvider);
    }

    createQuery<T>(url: string) {
        return new ODataQueryProvider<QueryOptions>(this).createQuery<T>().withOptions({ url });
    }
}
