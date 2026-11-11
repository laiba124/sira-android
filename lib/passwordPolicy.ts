export const PASSWORD_MIN_LENGTH = 12;

export const PASSWORD_POLICY_TEXT =
  "Minimum 12 characters with at least one uppercase letter, one lowercase letter, one number, and one special character.";

export type PasswordRule = {
  key: "length" | "uppercase" | "lowercase" | "number" | "special";
  label: string;
  passed: boolean;
};

export function getPasswordRules(password: string): PasswordRule[] {
  return [
    {
      key: "length",
      label: "At least 12 characters",
      passed: password.length >= PASSWORD_MIN_LENGTH,
    },
    {
      key: "uppercase",
      label: "At least one uppercase letter",
      passed: /[A-Z]/.test(password),
    },
    {
      key: "lowercase",
      label: "At least one lowercase letter",
      passed: /[a-z]/.test(password),
    },
    {
      key: "number",
      label: "At least one number",
      passed: /\d/.test(password),
    },
    {
      key: "special",
      label: "At least one special character",
      passed: /[^A-Za-z0-9]/.test(password),
    },
  ];
}

export function isStrongPassword(password: string) {
  return getPasswordRules(password).every((rule) => rule.passed);
}
