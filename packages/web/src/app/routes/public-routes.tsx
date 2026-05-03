import React, { Suspense } from 'react';

import { PageTitle } from '@/app/components/page-title';
import { RouteLoadingBar } from '@/components/custom/route-loading-bar';

import NotFoundPage from './404-page';
import AuthenticatePage from './authenticate';
import { EmbedPage } from './embed';
import { EmbeddedConnectionDialog } from './embed/embedded-connection-dialog';
import { McpAuthorizePage } from './mcp-authorize';
import { RedirectPage } from './redirect';

const ChatPage = React.lazy(() =>
  import('./chat').then((m) => ({ default: m.ChatPage })),
);
const FormPage = React.lazy(() =>
  import('./forms').then((m) => ({ default: m.FormPage })),
);

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<RouteLoadingBar />}>{children}</Suspense>;
}

export const publicRoutes = [
  {
    path: '/embed',
    element: <EmbedPage></EmbedPage>,
  },
  {
    path: '/embed/connections',
    element: <EmbeddedConnectionDialog></EmbeddedConnectionDialog>,
  },
  {
    path: '/authenticate',
    element: <AuthenticatePage />,
  },
  {
    path: '/forms/:flowId',
    element: (
      <PageTitle title="Forms">
        <SuspenseWrapper>
          <FormPage />
        </SuspenseWrapper>
      </PageTitle>
    ),
  },
  {
    path: '/chats/:flowId',
    element: (
      <PageTitle title="Chats">
        <SuspenseWrapper>
          <ChatPage />
        </SuspenseWrapper>
      </PageTitle>
    ),
  },
  {
    path: '/mcp-authorize',
    element: (
      <PageTitle title="Authorize">
        <McpAuthorizePage />
      </PageTitle>
    ),
  },
  {
    path: '/redirect',
    element: <RedirectPage></RedirectPage>,
  },
  {
    path: '/404',
    element: (
      <PageTitle title="Not Found">
        <NotFoundPage />
      </PageTitle>
    ),
  },
];
