import { Routes, Route, Link } from 'react-router';

function Dashboard() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold">poc-base admin</h1>
      <p className="text-slate-500">Placeholder dashboard route.</p>
      <Link to="/settings" className="text-blue-600 underline">
        Settings
      </Link>
    </div>
  );
}

function Settings() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold">Settings</h1>
      <p className="text-slate-500">Placeholder settings route.</p>
      <Link to="/" className="text-blue-600 underline">
        Dashboard
      </Link>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/settings" element={<Settings />} />
    </Routes>
  );
}
