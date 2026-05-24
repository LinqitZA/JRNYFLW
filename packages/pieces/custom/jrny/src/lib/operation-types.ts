export type JrnyHttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';

export type JrnyOperation = {
    name: string;
    displayName: string;
    description: string;
    method: JrnyHttpMethod;
    path: string;
    tag: string;
    pathParams: string[];
    queryParams: { name: string; required: boolean }[];
    hasBody: boolean;
};
