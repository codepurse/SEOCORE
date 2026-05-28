export function inferAnchorTheme(url: string, title?: string): string {
  if (title && title.length > 0) {
    const cleanTitle = title.replace(/[^\w\s-]/g, '').trim();
    const words = cleanTitle.split(/\s+/).slice(0, 4);
    const theme = words.join(' ');
    if (theme.length > 0) return theme;
  }

  const urlPath = url.split('/').filter(Boolean);
  const lastSegment = urlPath[urlPath.length - 1] || '';
  const withoutExt = lastSegment.replace(/\.[^.]+$/, '');
  const formatted = withoutExt.replace(/[-_]/g, ' ');

  if (formatted.length > 0) return formatted;
  return 'Learn more';
}

export function inferAnchorText(url: string, title?: string): string | undefined {
  if (title && title.length > 0 && title.length < 80) {
    return title.trim();
  }

  const urlPath = url.split('/').filter(Boolean);
  const lastSegment = urlPath[urlPath.length - 1] || '';
  const withoutExt = lastSegment.replace(/\.[^.]+$/, '');
  const formatted = withoutExt.replace(/[-_]/g, ' ');

  if (formatted.length > 0 && formatted.length < 60) {
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }

  return undefined;
}
