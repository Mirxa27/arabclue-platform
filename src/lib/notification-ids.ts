export function onboardingNotificationId(missing: readonly string[]): string {
  return `onboarding-${encodeURIComponent(missing.join(","))}`;
}
