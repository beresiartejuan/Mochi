declare module "wikipedia-api" {
  export interface ISearchResult {
    title: string;
    snippet: string;
    pageid: number;
  }

  export interface ISearch {
    results: ISearchResult[];
    suggestion?: string;
  }

  export interface IPage {
    title: string;
    extract: string;
    pageid: number;
  }

  export function search(query: string, limit?: number): Promise<ISearch>;
  export function page(query: string): Promise<IPage>;
}
