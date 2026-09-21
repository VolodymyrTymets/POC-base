import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { getAuthErrorMessage } from '@web/shared/api/auth/error-message';
import { RestorePasswordMutation } from '@web/shared/api/auth/mutations';
import { useMutation } from '@web/shared/api/react';
import {
  Field,
  FormCard,
  FormError,
  FormSuccess,
  submitButtonClass,
} from '../components/form';
import { validateEmail } from '../validation';
import { routes } from '../routes';

// The API answers the same way for known and unknown emails (no enumeration,
// ADR-0011), so this page must not hint at which one it was either.
const SENT_MESSAGE =
  'If an account exists for this email, a password reset link has been sent.';

export function ForgotPassword() {
  const [restorePassword, { loading }] = useMutation(RestorePasswordMutation);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const invalid = validateEmail(email);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    try {
      await restorePassword({
        variables: { restorePasswordInput: { email: email.trim() } },
      });
      setSent(true);
    } catch (caught) {
      setError(getAuthErrorMessage(caught));
    }
  };

  return (
    <FormCard title="Forgot password">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormSuccess message={sent ? SENT_MESSAGE : null} />
        <FormError message={error} />
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <button type="submit" disabled={loading} className={submitButtonClass}>
          Send reset link
        </button>
      </form>
      <p className="text-sm">
        <Link to={routes.signIn} className="text-brand hover:underline">
          Back to sign in
        </Link>
      </p>
    </FormCard>
  );
}
