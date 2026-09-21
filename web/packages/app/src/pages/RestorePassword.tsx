import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { getAuthErrorMessage } from '@web/shared/api/auth/error-message';
import { ResetPasswordMutation } from '@web/shared/api/auth/mutations';
import { useMutation } from '@web/shared/api/react';
import { Field, FormCard, FormError, submitButtonClass } from '../components/form';
import { setSignInNotice } from '../notice';
import { useSession } from '../session/SessionProvider';
import { validateNewPassword } from '../validation';

// The reset link is /restore-password?token=<token>. There is no email provider
// at POC stage (ADR-0011): a developer builds the link from the worker's log.
export function RestorePassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { isSignedIn, signOut } = useSession();
  const [resetPassword, { loading }] = useMutation(ResetPasswordMutation);
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <FormCard title="Restore password">
        <FormError message="This reset link is missing its token." />
        <Link to="/forgot-password" className="text-brand text-sm hover:underline">
          Request a new link
        </Link>
      </FormCard>
    );
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const invalid =
      validateNewPassword(newPassword) ??
      (newPassword === confirmation ? null : 'The passwords do not match.');
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    try {
      await resetPassword({
        variables: { resetPasswordInput: { token, newPassword } },
      });
    } catch (caught) {
      setError(getAuthErrorMessage(caught));
      return;
    }
    setSignInNotice('Password updated. Sign in with your new password.');
    if (isSignedIn) {
      // Every session ends after a reset; this also redirects to Sign in.
      await signOut();
    } else {
      navigate('/sign-in', { replace: true });
    }
  };

  return (
    <FormCard title="Restore password">
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormError message={error} />
        <Field
          label="New password (8 to 72 bytes)"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
        <Field
          label="Repeat new password"
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
        />
        <button type="submit" disabled={loading} className={submitButtonClass}>
          Set new password
        </button>
      </form>
    </FormCard>
  );
}
