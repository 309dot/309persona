/**
 * Format visitor name with honorific and truncation
 * @param name - Visitor name
 * @param defaultName - Default name if visitor name is empty
 * @returns Formatted name with honorific (님)
 */
export function formatVisitorName(name?: string | null, defaultName = '리크루터'): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) {
    return `${defaultName}님`;
  }

  // Remove existing '님' if present to process consistently
  const nameWithoutHonorific = trimmed.endsWith('님') ? trimmed.slice(0, -1) : trimmed;

  // Truncate if longer than 5 characters
  const displayName =
    nameWithoutHonorific.length > 5 ? `${nameWithoutHonorific.slice(0, 5)}...` : nameWithoutHonorific;

  return `${displayName}님`;
}
