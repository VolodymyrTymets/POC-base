import { Navigate, Outlet } from 'react-router';
import { useSession } from './SessionProvider';

export function RequireAuth() {
  const { isSignedIn } = useSession();
  return isSignedIn ? <Outlet /> : <Navigate to="/sign-in" replace />;
}
