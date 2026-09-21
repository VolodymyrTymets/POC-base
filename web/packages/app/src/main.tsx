import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { ApolloProvider } from '@web/shared/api/react';
import { App } from './App';
import { client } from './apollo';
import { SessionProvider } from './session/SessionProvider';
import './index.css';

// WHY: index.html always defines #root; this is the standard Vite entry point.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApolloProvider client={client}>
      <BrowserRouter>
        <SessionProvider>
          <App />
        </SessionProvider>
      </BrowserRouter>
    </ApolloProvider>
  </StrictMode>,
);
