export interface IMigrationItem {
  run: () => Promise<void>;
  inNeedToRun: () => Promise<boolean>;
  name: string;
}
