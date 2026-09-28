export {
  JsonDatabase,
  platformDatabase,
  readJson,
  writeJson,
  type ObjectTable,
} from "./json-database";

import { platformPaths } from "@backend/config/paths";
import { JsonDatabase, type ObjectTable } from "./json-database";

export function databaseDir() {
  return platformPaths().databaseDir;
}

export function tablePath(databaseDirPath: string, tableName: string) {
  return new JsonDatabase(databaseDirPath).tablePath(tableName);
}

export async function readObjectTable(
  databaseDirPath: string,
  tableName: string,
): Promise<ObjectTable> {
  return new JsonDatabase(databaseDirPath).readObjectTable(tableName);
}

export async function readListTable(databaseDirPath: string, tableName: string) {
  return new JsonDatabase(databaseDirPath).readListTable(tableName);
}
