import type { ApiErrorBody } from "../../shared/types";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

interface Options {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  cardToken?: string | null;
}

export async function api<T>(path: string, { method = "GET", body, cardToken }: Options = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cardToken) headers["x-card-token"] = cardToken;

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError("No connection. Check your signal and try again.", 0, "offline");
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // Empty or non-JSON body.
  }
  if (!res.ok) {
    const err = data as Partial<ApiErrorBody> | null;
    throw new ApiError(err?.error ?? "Something went wrong. Try again.", res.status, err?.code);
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong. Try again.";
}
