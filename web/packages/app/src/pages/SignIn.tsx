import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router';
import { getAuthErrorMessage } from '@web/shared/api/auth/error-message';
import { SignInMutation } from '@web/shared/api/auth/mutations';
import { useMutation } from '@web/shared/api/react';
import {
  Field,
  FormCard,
  FormError,
  FormSuccess,
  submitButtonClass,
} from '../components/form';
import { takeSignInNotice } from '../notice';
import { STORAGE_BLOCKED_MESSAGE } from '../messages';
import { useSession } from '../session/SessionProvider';
import { validateEmail } from '../validation';
import { routes } from '../routes';

export function SignIn() {
  const { isSignedIn, completeSignIn } = useSession();
  const [signIn, { loading }] = useMutation(SignInMutation);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice] = useState(takeSignInNotice);

  if (isSignedIn) {
    return <Navigate to={routes.account} replace />;
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const invalid = validateEmail(email);
    if (invalid || password === '') {
      setError(invalid ?? 'Enter your password.');
      return;
    }
    setError(null);
    try {
      const { data } = await signIn({
        variables: { signInInput: { email: email.trim(), password } },
      });
      if (!data) {
        throw new Error('signIn returned no data');
      }
      // Signing in flips isSignedIn, which redirects to /account above.
      if (!completeSignIn(data.signIn)) {
        setError(STORAGE_BLOCKED_MESSAGE);
      }
    } catch (caught) {
      setError(getAuthErrorMessage(caught));
    }
  };

  return (
    <FormCard title="Sign in">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormSuccess message={notice} />
        <FormError message={error} />
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button type="submit" disabled={loading} className={submitButtonClass}>
          Sign in
        </button>
      </form>
      <p className="flex justify-between text-sm">
        <Link to={routes.forgotPassword} className="text-brand hover:underline">
          Forgot password?
        </Link>
        <Link to={routes.signUp} className="text-brand hover:underline">
          Create an account
        </Link>
      </p>
    </FormCard>
  );
}
