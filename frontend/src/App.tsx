import { Navigate, Route, Routes } from 'react-router-dom';

import { ChatPage } from './pages/ChatPage';
import { DashboardPage } from './pages/DashboardPage';
import { EntryPage } from './pages/EntryPage';
import { PersonaChatV2Page } from './pages/PersonaChatV2Page';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/persona" replace />} />
      <Route path="/entry" element={<EntryPage />} />
      <Route path="/chat" element={<ChatPage />} />
      <Route path="/persona" element={<PersonaChatV2Page />} />
      <Route path="/admin" element={<DashboardPage />} />
      <Route path="*" element={<Navigate to="/persona" replace />} />
    </Routes>
  );
}

export default App;
