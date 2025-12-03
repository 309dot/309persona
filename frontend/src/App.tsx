import { Navigate, Route, Routes } from 'react-router-dom';

import { ChatPage } from './pages/ChatPage';
import { DashboardPage } from './pages/DashboardPage';
import { EntryPage } from './pages/EntryPage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<EntryPage />} />
      <Route path="/chat" element={<ChatPage />} />
      <Route path="/admin" element={<DashboardPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
