export async function checkDatabaseReady(
  probe: () => Promise<unknown>,
): Promise<boolean> {
  try {
    await probe();
    return true;
  } catch {
    return false;
  }
}
