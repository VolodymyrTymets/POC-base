import { Navigate, Outlet, Route, Routes } from 'react-router';
import { Header } from './components/Header';
import { RequireAuth } from './session/RequireAuth';

function Layout() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-md px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/account" replace />} />
        <Route element={<RequireAuth />}>
          <Route path="/account" element={<h1>Account</h1>} />
        </Route>
      </Route>
    </Routes>
  );
}
