import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * BR-KEY — API keys "For Agents":
 * - key format: pf-<32 hex>
 * - list never returns plaintext — only name/createdAt/expiresAt/preview
 * - verify(key): sha256 hash comparison
 * - persists to a JSON file (postgres optional when self-hosting)
 */
export interface ApiKeyRecord {
  id: string;
  name: string;
  hashed: string; // sha256 hex
  preview: string; // first 8 characters, for recognition
  createdAt: number;
  expiresAt: number | null;
  lastUsedAt: number | null;
}

export function generateApiKey(): { plaintext: string; hashed: string; preview: string } {
  const plaintext = `pf-${randomBytes(16).toString("hex")}`;
  return { plaintext, hashed: hashKey(plaintext), preview: plaintext.slice(0, 11) };
}

export function hashKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export class ApiKeyStore {
  private records: ApiKeyRecord[] = [];
  constructor(private file = path.join(process.env.OIA_DATA_DIR ?? ".data", "api-keys.json")) {}

  async load(): Promise<void> {
    try {
      this.records = JSON.parse(await readFile(this.file, "utf8"));
    } catch { this.records = []; }
  }
  private async save(): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(this.records, null, 2));
  }

  async create(name: string, ttlDays: number | null = null): Promise<{ record: ApiKeyRecord; plaintext: string }> {
    const { plaintext, hashed, preview } = generateApiKey();
    const record: ApiKeyRecord = {
      id: `key_${Date.now().toString(36)}`,
      name: name.trim() || "Untitled key",
      hashed, preview,
      createdAt: Date.now(),
      expiresAt: ttlDays ? Date.now() + ttlDays * 86400_000 : null,
      lastUsedAt: null,
    };
    this.records.push(record);
    await this.save();
    return { record, plaintext };
  }

/** Metadata only — no plaintext (BR-KEY). */
  list(): ApiKeyRecord[] {
    return this.records.map((r) => ({ ...r, hashed: "" }));
  }

  verify(plaintext: string): ApiKeyRecord | null {
    const hashed = hashKey(plaintext.trim());
    const rec = this.records.find((r) => r.hashed === hashed);
    if (!rec) return null;
    if (rec.expiresAt && rec.expiresAt < Date.now()) return null; // expired keys are rejected
    rec.lastUsedAt = Date.now();
    return rec;
  }

  async revoke(id: string): Promise<boolean> {
    const before = this.records.length;
    this.records = this.records.filter((r) => r.id !== id);
    await this.save();
    return this.records.length < before;
  }
}
