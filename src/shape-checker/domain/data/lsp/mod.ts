import { join } from "jsr:@std/path";
import type { ExportInfo, LspConfig } from "../../../../core/dto/types.ts";

export class Lsp {
  private process: Deno.ChildProcess | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private requestId = 0;
  private buffer = "";
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private readLoop: Promise<void> | null = null;
  private projectRoot: string;
  private config: LspConfig;

  constructor(projectRoot: string, config: LspConfig) {
    this.projectRoot = projectRoot;
    this.config = config;
  }

  async initialize(): Promise<void> {
    const cmd = new Deno.Command(this.config.command, {
      args: this.config.args,
      stdin: "piped",
      stdout: "piped",
      stderr: "null",
    });

    this.process = cmd.spawn();
    this.writer = this.process.stdin.getWriter();
    this.reader = this.process.stdout.getReader();
    this.readLoop = this.startReadLoop();

    await this.request("initialize", {
      processId: Deno.pid,
      capabilities: {},
      rootUri: `file://${this.projectRoot}`,
      ...(this.config.initializationOptions && {
        initializationOptions: this.config.initializationOptions,
      }),
    });

    await this.notify("initialized", {});
  }

  async getExportTypes(relPath: string): Promise<ExportInfo[]> {
    const absPath = join(this.projectRoot, relPath);
    const uri = `file://${absPath}`;

    const content = await Deno.readTextFile(absPath);
    const version = 1;

    await this.notify("textDocument/didOpen", {
      textDocument: { uri, languageId: "typescript", version, text: content },
    });

    const symbols = await this.request("textDocument/documentSymbol", {
      textDocument: { uri },
    }) as Array<{ name: string; kind: number; detail?: string }> | null;

    await this.notify("textDocument/didClose", {
      textDocument: { uri },
    });

    if (!symbols || !Array.isArray(symbols)) return [];

    const exports: ExportInfo[] = [];
    const lines = content.split("\n");

    for (const sym of symbols) {
      const isExported = lines.some((line) =>
        line.includes(`export`) && line.includes(sym.name)
      );

      if (isExported) {
        exports.push({
          name: sym.name,
          kind: symbolKindToString(sym.kind),
          type: sym.detail ?? "unknown",
        });
      }
    }

    return exports;
  }

  async getSiblingExportSignatures(
    businessDir: string,
    featureDirs: string[],
  ): Promise<Map<string, ExportInfo[]>> {
    const result = new Map<string, ExportInfo[]>();
    for (const dir of featureDirs) {
      const modPath = `${businessDir}/${dir}/mod.ts`;
      try {
        const exports = await this.getExportTypes(modPath);
        result.set(dir, exports);
      } catch {
        result.set(dir, []);
      }
    }
    return result;
  }

  async shutdown(): Promise<void> {
    if (!this.process) return;
    const proc = this.process;
    this.process = null;
    try {
      await this.request("shutdown", null);
      await this.notify("exit", null);
    } catch {
      // best effort
    }
    try { await this.writer?.close(); } catch { /* */ }
    try { await this.reader?.cancel(); } catch { /* */ }
    this.writer = null;
    this.reader = null;
    try { proc.kill(); } catch { /* */ }
    try { await proc.status; } catch { /* */ }
  }

  private async request(method: string, params: unknown): Promise<unknown> {
    const id = ++this.requestId;
    const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params });

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send(msg);
    });
  }

  private async notify(method: string, params: unknown): Promise<void> {
    const msg = JSON.stringify({ jsonrpc: "2.0", method, params });
    await this.send(msg);
  }

  private async send(json: string): Promise<void> {
    const body = new TextEncoder().encode(json);
    const header = new TextEncoder().encode(
      `Content-Length: ${body.byteLength}\r\n\r\n`,
    );
    await this.writer!.write(header);
    await this.writer!.write(body);
  }

  private async startReadLoop(): Promise<void> {
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await this.reader!.read();
      if (done) break;
      this.buffer += decoder.decode(value, { stream: true });
      this.processBuffer();
    }
  }

  private processBuffer(): void {
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;

      const header = this.buffer.slice(0, headerEnd);
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(match[1], 10);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + contentLength;

      if (this.buffer.length < bodyEnd) break;

      const body = this.buffer.slice(bodyStart, bodyEnd);
      this.buffer = this.buffer.slice(bodyEnd);

      try {
        const msg = JSON.parse(body);
        if ("id" in msg && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.error) {
            reject(new Error(msg.error.message));
          } else {
            resolve(msg.result);
          }
        }
      } catch {
        // malformed message, skip
      }
    }
  }
}

function symbolKindToString(kind: number): string {
  const kinds: Record<number, string> = {
    1: "File", 2: "Module", 3: "Namespace", 4: "Package",
    5: "Class", 6: "Method", 7: "Property", 8: "Field",
    9: "Constructor", 10: "Enum", 11: "Interface", 12: "Function",
    13: "Variable", 14: "Constant", 15: "String", 16: "Number",
    17: "Boolean", 18: "Array", 19: "Object", 20: "Key",
    21: "Null", 22: "EnumMember", 23: "Struct", 24: "Event",
    25: "Operator", 26: "TypeParameter",
  };
  return kinds[kind] ?? "Unknown";
}
