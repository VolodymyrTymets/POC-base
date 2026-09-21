import { graphql } from '../generated/gql';

// The names of these operations are load-bearing: apollo-client.ts skips the
// refresh-on-unauthorised handling for the ones in AUTH_OPERATION_NAMES,
// because the API answers a wrong password or a bad reset token with the same
// UNAUTHENTICATED code as an expired access token (KAN-13 spec, edge cases).
export const SignInMutation = graphql(`
  mutation SignIn($signInInput: PasswordSignInInput!) {
    signIn(signInInput: $signInInput) {
      accessToken
      refreshToken
    }
  }
`);

export const SignUpMutation = graphql(`
  mutation SignUp($signUpInput: SignUpInput!) {
    signUp(signUpInput: $signUpInput) {
      accessToken
      refreshToken
    }
  }
`);

export const RestorePasswordMutation = graphql(`
  mutation RestorePassword($restorePasswordInput: RestorePasswordInput!) {
    restorePassword(restorePasswordInput: $restorePasswordInput) {
      success
    }
  }
`);

export const ResetPasswordMutation = graphql(`
  mutation ResetPassword($resetPasswordInput: ResetPasswordInput!) {
    resetPassword(resetPasswordInput: $resetPasswordInput)
  }
`);

export const ChangePasswordMutation = graphql(`
  mutation ChangePassword($changePasswordInput: ChangePasswordInput!) {
    changePassword(changePasswordInput: $changePasswordInput)
  }
`);

export const RefreshTokenMutation = graphql(`
  mutation RefreshToken {
    refreshToken {
      accessToken
      refreshToken
    }
  }
`);

export const SignOutMutation = graphql(`
  mutation SignOut {
    signOut
  }
`);
