export function routeParam(
  req: { params: Record<string, string | string[] | undefined> },
  name: string,
): string {
  const value = req.params[name];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
