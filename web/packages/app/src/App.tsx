import { Navigate, Outlet, Route, Routes } from 'react-router';
import { Header } from './components/Header';
import { Account } from './pages/Account';
import { ForgotPassword } from './pages/ForgotPassword';
import { RestorePassword } from './pages/RestorePassword';
import { SignIn } from './pages/SignIn';
import { SignUp } from './pages/SignUp';
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
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/sign-up" element={<SignUp />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/restore-password" element={<RestorePassword />} />
        <Route element={<RequireAuth />}>
          <Route path="/account" element={<Account />} />
        </Route>
      </Route>
    </Routes>
  );
}
