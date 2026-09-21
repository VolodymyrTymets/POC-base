import { useState, type FormEvent } from 'react';
import { getAuthErrorMessage } from '@web/shared/api/auth/error-message';
import { ChangePasswordMutation } from '@web/shared/api/auth/mutations';
import { useMutation } from '@web/shared/api/react';
import { Field, FormCard, FormError, submitButtonClass } from '../components/form';
import { setSignInNotice } from '../notice';
import { useSession } from '../session/SessionProvider';
import { validateNewPassword } from '../validation';

export function Account() {
  const { email, signOut } = useSession();
  const [changePassword, { loading }] = useMutation(ChangePasswordMutation);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (currentPassword === '') {
      setError('Enter your current password.');
      return;
    }
    const invalid = validateNewPassword(newPassword);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    try {
      await changePassword({
        variables: { changePasswordInput: { currentPassword, newPassword } },
      });
    } catch (caught) {
      // A wrong current password is INVALID_CREDENTIALS: shown here, and it
      // does not sign the user out (apollo-client.ts only refreshes on a bare
      // "Unauthorized").
      setError(
        getAuthErrorMessage(caught, {
          INVALID_CREDENTIALS: 'The current password is incorrect.',
        }),
      );
      return;
    }
    // The API clears the stored refresh token on a password change (ADR-0011),
    // so the session could not be refreshed later: end it now, on purpose.
    setSignInNotice('Password changed. Sign in with your new password.');
    await signOut();
  };

  return (
    <FormCard title="Account">
      <p className="text-sm text-slate-700">
        Signed in as <span className="font-medium">{email ?? '...'}</span>
      </p>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <h2 className="text-lg font-semibold">Change password</h2>
        <FormError message={error} />
        <Field
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
        />
        <Field
          label="New password (8 to 72 bytes)"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
        <button type="submit" disabled={loading} className={submitButtonClass}>
          Change password
        </button>
      </form>
    </FormCard>
  );
}
