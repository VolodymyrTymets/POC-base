import { Navigate, Outlet, Route, Routes } from 'react-router';
import { Header } from './components/Header';
import { Account } from './pages/Account';
import { ForgotPassword } from './pages/ForgotPassword';
import { RestorePassword } from './pages/RestorePassword';
import { SignIn } from './pages/SignIn';
import { SignUp } from './pages/SignUp';
import { RequireAuth } from './session/RequireAuth';
import { routes } from './routes';

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
        <Route path={routes.home} element={<Navigate to={routes.account} replace />} />
        <Route path={routes.signIn} element={<SignIn />} />
        <Route path={routes.signUp} element={<SignUp />} />
        <Route path={routes.forgotPassword} element={<ForgotPassword />} />
        <Route path={routes.restorePassword} element={<RestorePassword />} />
        <Route element={<RequireAuth />}>
          <Route path={routes.account} element={<Account />} />
        </Route>
      </Route>
    </Routes>
  );
}
