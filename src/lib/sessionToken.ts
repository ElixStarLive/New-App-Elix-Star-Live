let accessToken: string | null = null;

export function setSessionToken(token: string | null): void {
  accessToken = token && token.trim() ? token : null;
}

export function getSessionToken(): string | null {
  return accessToken;
}
