/** Chính sách mật khẩu của backend (user service): kiểm tra sớm ở trình duyệt, backend vẫn kiểm tra lại. */
export const PASSWORD_MIN_LENGTH = 8;

export function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  if (Array.from(password).length < PASSWORD_MIN_LENGTH) issues.push(`Mật khẩu phải có ít nhất ${PASSWORD_MIN_LENGTH} ký tự.`);
  if (!/\p{L}/u.test(password)) issues.push("Mật khẩu phải có ít nhất một chữ cái.");
  if (!/\d/.test(password)) issues.push("Mật khẩu phải có ít nhất một chữ số.");
  return issues;
}
