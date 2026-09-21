import { Navigate, Outlet } from 'react-router';
import { useSession } from './SessionProvider';
import { routes } from '../routes';

export function RequireAuth() {
  const { isSignedIn } = useSession();
  return isSignedIn ? <Outlet /> : <Navigate to={routes.signIn} replace />;
}
