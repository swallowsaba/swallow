export {
  initPersistence,
  rememberSource,
  getSourceKey,
  restoreEdit,
} from './model/persistence-service';
export { sourceKeyForFile, SCHEMA_VERSION } from './model/serialize';
export type { PersistedEdit, PersistedSettings } from './model/serialize';
