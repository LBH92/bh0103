/**
 * Environment detection utility for Google AI Studio Preview & Local development
 */

export function isPreviewEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname.toLowerCase();
  return (
    hostname.includes('run.app') ||
    hostname.includes('localhost') ||
    hostname.includes('127.0.0.1') ||
    hostname.includes('webcontainer') ||
    hostname.includes('ais-dev-') ||
    hostname.includes('ais-pre-') ||
    hostname === ''
  );
}

export function isLocalEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname.toLowerCase();
  return (
    hostname.includes('localhost') ||
    hostname.includes('127.0.0.1') ||
    hostname.includes('webcontainer')
  );
}

export function getEnvironmentMode(): 'preview' | 'local' | 'production' {
  if (isLocalEnvironment()) return 'local';
  if (isPreviewEnvironment()) return 'preview';
  return 'production';
}
