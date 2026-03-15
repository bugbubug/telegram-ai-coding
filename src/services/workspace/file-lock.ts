import lockfile from "proper-lockfile";

export const acquireLock = async (
  targetPath: string,
  abortSignal?: AbortSignal,
): Promise<() => Promise<void>> => {
  if (abortSignal?.aborted) {
    throw new Error("Lock acquisition aborted");
  }

  const release = await lockfile.lock(targetPath, {
    realpath: false,
    retries: {
      retries: 3,
      minTimeout: 50,
      maxTimeout: 200,
    },
  });

  if (abortSignal?.aborted) {
    await release();
    throw new Error("Lock acquisition aborted");
  }

  return release;
};
