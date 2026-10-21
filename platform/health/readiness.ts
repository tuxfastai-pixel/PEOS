export async function checkDatabaseReady(
  probe: () => Promise<unknown>,
): Promise<boolean> {
  try {
    await probe();
    return true;
  } catch (error) {
    console.error("PEOS database readiness probe failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown database error",
    });

    return false;
  }
}