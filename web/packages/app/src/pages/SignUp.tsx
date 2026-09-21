import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router';
import { getAuthErrorMessage } from '@web/shared/api/auth/error-message';
import { SignUpMutation } from '@web/shared/api/auth/mutations';
import { useMutation } from '@web/shared/api/react';
import { Field, FormCard, FormError, submitButtonClass } from '../components/form';
import { STORAGE_BLOCKED_MESSAGE } from '../messages';
import { useSession } from '../session/SessionProvider';
import { validateEmail, validateNewPassword } from '../validation';
import { routes } from '../routes';

export function SignUp() {
  const { isSignedIn, completeSignIn } = useSession();
  const [signUp, { loading }] = useMutation(SignUpMutation);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (isSignedIn) {
    return <Navigate to={routes.account} replace />;
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const invalid = validateEmail(email) ?? validateNewPassword(password);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    try {
      const { data } = await signUp({
        variables: { signUpInput: { email: email.trim(), password } },
      });
      if (!data) {
        throw new Error('signUp returned no data');
      }
      if (!completeSignIn(data.signUp)) {
        setError(STORAGE_BLOCKED_MESSAGE);
      }
    } catch (caught) {
      setError(getAuthErrorMessage(caught));
    }
  };

  return (
    <FormCard title="Create an account">
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
          label="Password (8 to 72 bytes)"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button type="submit" disabled={loading} className={submitButtonClass}>
          Sign up
        </button>
      </form>
      <p className="text-sm">
        Already registered?{' '}
        <Link to={routes.signIn} className="text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </FormCard>
  );
}
