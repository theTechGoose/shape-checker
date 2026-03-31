import { join } from "jsr:@std/path";
import type {
  ExportInfo,
  HoverResult,
  Location,
  Diagnostic,
  LspConfig,
  LspCapabilities,
} from "../../../../core/dto/types.ts";

// deno-lint-ignore no-explicit-any
type ServerCapabilities = Record<string, any>;

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
  private openDocs = new Set<string>();
  capabilities: LspCapabilities = {
    documentSymbol: false,
    hover: false,
    references: false,
    implementation: false,
    definition: false,
    diagnostics: false,
  };

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

    const result = await this.request("initialize", {
      processId: Deno.pid,
      capabilities: {},
      rootUri: `file://${this.projectRoot}`,
      ...(this.config.initializationOptions && {
        initializationOptions: this.config.initializationOptions,
      }),
    }) as { capabilities?: ServerCapabilities } | null;

    const caps = result?.capabilities ?? {};
    this.capabilities = {
      documentSymbol: !!caps.documentSymbolProvider,
      hover: !!caps.hoverProvider,
      references: !!caps.referencesProvider,
      implementation: !!caps.implementationProvider,
      definition: !!caps.definitionProvider,
      diagnostics: !!caps.diagnosticProvider,
    };

    await this.notify("initialized", {});
  }

  // -- Document management --

  private async openDoc(relPath: string): Promise<{ uri: string; content: string }> {
    const absPath = join(this.projectRoot, relPath);
    const uri = `file://${absPath}`;

    if (!this.openDocs.has(uri)) {
      const content = await Deno.readTextFile(absPath);
      await this.notify("textDocument/didOpen", {
        textDocument: { uri, languageId: "typescript", version: 1, text: content },
      });
      this.openDocs.add(uri);
      return { uri, content };
    }

    const content = await Deno.readTextFile(absPath);
    return { uri, content };
  }

  private async closeDoc(uri: string): Promise<void> {
    if (this.openDocs.has(uri)) {
      await this.notify("textDocument/didClose", { textDocument: { uri } });
      this.openDocs.delete(uri);
    }
  }

  // -- Capabilities --

  async getExportTypes(relPath: string): Promise<ExportInfo[]> {
    if (!this.capabilities.documentSymbol) return [];

    const { uri, content } = await this.openDoc(relPath);

    const symbols = await this.request("textDocument/documentSymbol", {
      textDocument: { uri },
    }) as Array<{ name: string; kind: number; detail?: string }> | null;

    await this.closeDoc(uri);

    if (!symbols || !Array.isArray(symbols)) return [];

    const exports: ExportInfo[] = [];
    const lines = content.split("\n");

    for (const sym of symbols) {
      const isExported = lines.some((line) =>
        line.includes("export") && line.includes(sym.name)
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

  async hover(relPath: string, line: number, character: number): Promise<HoverResult | null> {
    if (!this.capabilities.hover) return null;

    const { uri } = await this.openDoc(relPath);

    const result = await this.request("textDocument/hover", {
      textDocument: { uri },
      position: { line, character },
    // deno-lint-ignore no-explicit-any
    }) as any | null;

    await this.closeDoc(uri);

    if (!result?.contents) return null;

    let contents: string;
    if (typeof result.contents === "string") {
      contents = result.contents;
    } else if (result.contents.value) {
      contents = result.contents.value;
    } else if (Array.isArray(result.contents)) {
      contents = result.contents.map((c: string | { value: string }) =>
        typeof c === "string" ? c : c.value
      ).join("\n");
    } else {
      contents = JSON.stringify(result.contents);
    }

    return { contents, line, character };
  }

  async findReferences(relPath: string, line: number, character: number): Promise<Location[]> {
    if (!this.capabilities.references) return [];

    const { uri } = await this.openDoc(relPath);

    const result = await this.request("textDocument/references", {
      textDocument: { uri },
      position: { line, character },
      context: { includeDeclaration: false },
    }) as Array<{ uri: string; range: { start: { line: number; character: number } } }> | null;

    await this.closeDoc(uri);

    if (!result || !Array.isArray(result)) return [];

    return result.map((r) => ({
      uri: r.uri,
      line: r.range.start.line,
      character: r.range.start.character,
    }));
  }

  async findImplementations(relPath: string, line: number, character: number): Promise<Location[]> {
    if (!this.capabilities.implementation) return [];

    const { uri } = await this.openDoc(relPath);

    const result = await this.request("textDocument/implementation", {
      textDocument: { uri },
      position: { line, character },
    }) as Array<{ uri: string; range: { start: { line: number; character: number } } }> | null;

    await this.closeDoc(uri);

    if (!result || !Array.isArray(result)) return [];

    return result.map((r) => ({
      uri: r.uri,
      line: r.range.start.line,
      character: r.range.start.character,
    }));
  }

  async goToDefinition(relPath: string, line: number, character: number): Promise<Location[]> {
    if (!this.capabilities.definition) return [];

    const { uri } = await this.openDoc(relPath);

    const result = await this.request("textDocument/definition", {
      textDocument: { uri },
      position: { line, character },
    // deno-lint-ignore no-explicit-any
    }) as any;

    await this.closeDoc(uri);

    if (!result) return [];

    // Can be a single location or array
    const locs = Array.isArray(result) ? result : [result];
    return locs
      .filter((r: { uri?: string }) => r.uri)
      .map((r: { uri: string; range: { start: { line: number; character: number } } }) => ({
        uri: r.uri,
        line: r.range.start.line,
        character: r.range.start.character,
      }));
  }

  async getDiagnostics(relPath: string): Promise<Diagnostic[]> {
    if (!this.process) return [];

    const { uri } = await this.openDoc(relPath);

    // Give the server time to produce diagnostics
    await new Promise((r) => setTimeout(r, 500));

    // For pull-based diagnostics (LSP 3.17+)
    if (this.capabilities.diagnostics) {
      const result = await this.request("textDocument/diagnostic", {
        textDocument: { uri },
      // deno-lint-ignore no-explicit-any
      }) as { items?: any[] } | null;

      await this.closeDoc(uri);

      if (!result?.items) return [];
      return result.items.map(parseDiagnostic);
    }

    // For push-based: we'd need to track notifications (not implemented yet)
    await this.closeDoc(uri);
    return [];
  }

  // -- Lifecycle --

  async shutdown(): Promise<void> {
    if (!this.process) return;
    const proc = this.process;
    this.process = null;

    // Close all open docs
    for (const uri of this.openDocs) {
      try {
        await this.notify("textDocument/didClose", { textDocument: { uri } });
      } catch { /* */ }
    }
    this.openDocs.clear();

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

  // -- JSON-RPC transport --

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

const SEVERITY_MAP: Record<number, Diagnostic["severity"]> = {
  1: "error",
  2: "warning",
  3: "info",
  4: "hint",
};

// deno-lint-ignore no-explicit-any
function parseDiagnostic(d: any): Diagnostic {
  return {
    message: d.message ?? "",
    severity: SEVERITY_MAP[d.severity] ?? "info",
    line: d.range?.start?.line ?? 0,
    character: d.range?.start?.character ?? 0,
  };
}
