import { platformDatabase, type JsonDatabase, type ObjectTable } from "@backend/shared/database";

const SPACES_TABLE = "knowledge_spaces";
const META_TABLE = "knowledge_meta";

export interface KnowledgeRepository {
  readSpaces(): Promise<ObjectTable>;
  writeSpaces(spaces: ObjectTable): Promise<void>;
  readMeta(): Promise<ObjectTable>;
  writeMeta(meta: ObjectTable): Promise<void>;
}

export class JsonKnowledgeRepository implements KnowledgeRepository {
  constructor(private readonly database: JsonDatabase = platformDatabase()) {}

  readSpaces() {
    return this.database.readObjectTable(SPACES_TABLE);
  }

  writeSpaces(spaces: ObjectTable) {
    return this.database.writeTable(SPACES_TABLE, spaces);
  }

  readMeta() {
    return this.database.readObjectTable(META_TABLE);
  }

  writeMeta(meta: ObjectTable) {
    return this.database.writeTable(META_TABLE, meta);
  }
}
