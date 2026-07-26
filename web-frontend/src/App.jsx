// TEMPORARY preview file — lets you see both dashboards without real
// routing/login. Delete this switcher once the real App.jsx with
// react-router-dom and role-based redirects is wired up by whoever's
// building auth.
import { useState } from 'react';
import VerificationQueue from './pages/mera-admin/VerificationQueue';
import EmtManagement from './pages/ambulance-admin/EmtManagement';

function App() {
  const [view, setView] = useState('mera-admin');

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, padding: 10, background: '#000' }}>
        <button onClick={() => setView('mera-admin')} style={{ padding: '6px 14px', cursor: 'pointer' }}>
          MERA Admin (Verification)
        </button>
        <button onClick={() => setView('ambulance-admin')} style={{ padding: '6px 14px', cursor: 'pointer' }}>
          Ambulance Admin (EMTs)
        </button>
      </div>
      {view === 'mera-admin' ? <VerificationQueue /> : <EmtManagement />}
    </div>
  );
}

export default App;
