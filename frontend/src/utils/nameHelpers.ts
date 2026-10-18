// Computes display initials from a real name — used wherever the family
// module needs an avatar placeholder for the logged-in user (previously a
// hardcoded "YO" in DashboardHeader.tsx and more.tsx).
export function getInitials(fullName: string | null | undefined): string {
  if (!fullName) return '?';
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
