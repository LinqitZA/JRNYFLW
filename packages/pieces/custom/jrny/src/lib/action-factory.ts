import { createAction, InputPropertyMap, Property } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { jrnyAuth } from './auth';
import { jrnyClient } from './client';
import { JrnyHttpMethod, JrnyOperation } from './operation-types';

export function buildJrnyAction(op: JrnyOperation) {
  const props: InputPropertyMap = {};
  for (const p of op.pathParams) {
    props[p] = Property.ShortText({ displayName: humanizeParam(p), required: true });
  }
  for (const q of op.queryParams) {
    props[q.name] = Property.ShortText({ displayName: humanizeParam(q.name), required: q.required });
  }
  if (op.hasBody) {
    props['body'] = Property.Json({
      displayName: 'Body',
      description: 'Request body JSON (build it with the Mapper step).',
      required: true,
    });
  }
  return createAction({
    auth: jrnyAuth,
    name: op.name,
    displayName: op.displayName,
    description: op.description,
    props,
    async run(context) {
      const connection = context.auth.props;
      const values = context.propsValue;
      let path = op.path.replace('{entityId}', encodeURIComponent(connection.entityId));
      for (const p of op.pathParams) {
        path = path.replace(`{${p}}`, encodeURIComponent(stringifyValue(values[p])));
      }
      const query: Record<string, string> = {};
      for (const q of op.queryParams) {
        const v = values[q.name];
        if (v !== undefined && v !== '') {
          query[q.name] = stringifyValue(v);
        }
      }
      return jrnyClient.request({
        auth: connection,
        method: METHODS[op.method],
        path,
        query,
        body: op.hasBody ? values['body'] : undefined,
      });
    },
  });
}

function humanizeParam(name: string): string {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function stringifyValue(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

const METHODS: Record<JrnyHttpMethod, HttpMethod> = {
  GET: HttpMethod.GET,
  POST: HttpMethod.POST,
  PATCH: HttpMethod.PATCH,
  DELETE: HttpMethod.DELETE,
  PUT: HttpMethod.PUT,
};
