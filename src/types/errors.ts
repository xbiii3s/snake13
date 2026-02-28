/** Error returned from Rust backend via IPC */
export interface AppError {
  kind: string;
  message: string;
}

/** Check if a value is an AppError */
export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    "message" in value
  );
}
