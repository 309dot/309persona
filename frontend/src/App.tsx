import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { PersonaChatV2Page } from './pages/PersonaChatV2Page';

// The admin dashboard pulls in Firebase Auth; keep it out of the visitor bundle.
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })),
);

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/persona" replace />} />
      <Route path="/persona" element={<PersonaChatV2Page />} />
      <Route
        path="/admin"
        element={
          <Suspense fallback={null}>
            <DashboardPage />
          </Suspense>
        }
      />
      <Route path="*" element={<Navigate to="/persona" replace />} />
    </Routes>
  );
}

export default App;
