export class KnowledgeError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "KnowledgeError";
  }
}
