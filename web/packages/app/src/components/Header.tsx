import { Link } from 'react-router';
import { useSession } from '../session/SessionProvider';

export function Header() {
  const { isSignedIn, email, signOut } = useSession();

  return (
    <header className="flex items-center justify-between border-b border-slate-200 px-6 py-3">
      <Link to="/" className="text-brand text-lg font-bold">
        poc-base
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        {isSignedIn ? (
          <>
            <Link to="/account" className="text-slate-700 hover:underline">
              {email ?? 'Account'}
            </Link>
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-50"
            >
              Sign out
            </button>
          </>
        ) : (
          <Link to="/sign-in" className="text-brand hover:underline">
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}
