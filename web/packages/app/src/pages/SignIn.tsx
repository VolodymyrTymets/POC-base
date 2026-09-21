import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router';
import { getAuthErrorMessage } from '@web/shared/api/auth/error-message';
import { SignInMutation } from '@web/shared/api/auth/mutations';
import { useMutation } from '@web/shared/api/react';
import { Field, FormCard, FormError, submitButtonClass } from '../components/form';
import { useSession } from '../session/SessionProvider';
import { validateEmail } from '../validation';

export function SignIn() {
  const { isSignedIn, completeSignIn } = useSession();
  const [signIn, { loading }] = useMutation(SignInMutation);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (isSignedIn) {
    return <Navigate to="/account" replace />;
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
      completeSignIn(data.signIn);
    } catch (caught) {
      setError(getAuthErrorMessage(caught));
    }
  };

  return (
    <FormCard title="Sign in">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
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
        <Link to="/forgot-password" className="text-brand hover:underline">
          Forgot password?
        </Link>
        <Link to="/sign-up" className="text-brand hover:underline">
          Create an account
        </Link>
      </p>
    </FormCard>
  );
}
