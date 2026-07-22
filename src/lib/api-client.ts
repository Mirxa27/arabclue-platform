/**
 * Client-side fetch helpers shared by dashboard panels.
 */

export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export async function apiJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(input, init);
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string; code?: string })
        : { error: `Request failed (${res.status})` };
    throw new ApiClientError(err.error, res.status, err.code);
  }
  return body as T;
}
