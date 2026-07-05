export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function tryRemoteWrite(
  operation: () => Promise<void>,
  onError: (message: string) => void,
  fallback = "Firebase sync failed",
) {
  try {
    await operation();
    return true;
  } catch (error) {
    onError(errorMessage(error, fallback));
    return false;
  }
}
