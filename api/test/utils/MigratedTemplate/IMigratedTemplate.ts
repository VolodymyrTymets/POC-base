export interface IMigratedTemplate {
  getDump(): Promise<Blob>;
}
