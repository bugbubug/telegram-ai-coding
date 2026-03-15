export class RepositorySelectionStore {
  private readonly selectedRepositories = new Map<number, string>();

  public setSelectedRepository(userId: number, repositoryPath: string): void {
    this.selectedRepositories.set(userId, repositoryPath);
  }

  public getSelectedRepository(userId: number): string | null {
    return this.selectedRepositories.get(userId) ?? null;
  }

  public clearSelectedRepository(userId: number): void {
    this.selectedRepositories.delete(userId);
  }
}
