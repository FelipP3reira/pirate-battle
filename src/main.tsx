import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { discardInterruptedMatch } from './app/router';
import { startMockServer } from './mocks/browser';
import { applyScenarioFromUrl } from './mocks/scenarios';
import { installTestApi } from './testing/hooks';
import './ui/styles.css';

async function bootstrap(): Promise<void> {
  discardInterruptedMatch();
  applyScenarioFromUrl();
  installTestApi();
  try {
    await startMockServer();
  } catch (error) {
    console.warn('Mock API could not start; ranking and history will be unavailable.', error);
  }
  const root = document.getElementById('root');
  if (!root) throw new Error('Missing #root element');
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
