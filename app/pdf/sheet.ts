import { readFileSync } from "node:fs";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";

// Laying out a page of a PDF: a cursor, word wrapping, and page breaks.
//
// This started inside the job-application renderer and moved out when the
// supply order needed the same three things. No template library and no
// HTML-to-PDF service, which would mean shipping a headless browser to draw
// documents whose shape we already know.
//
// ——— The font, and what it can't draw ———
//
// DejaVu Sans is bundled next to this file (Bitstream Vera licence, see
// DejaVuSans-LICENSE.txt) and traced into the build by next.config.ts, because
// it is read off disk at runtime and nothing in the module graph points at it.
// Any route that renders a PDF needs an entry there or it will work perfectly
// in dev and throw on its first request in production — the worst shape a bug
// can have.
//
// pdf-lib's built-in Helvetica encodes WinAnsi only and *throws* on anything
// outside it, which would mean an application from somebody named Nguyễn
// taking the whole endpoint down. DejaVu covers Latin, Greek, Cyrillic and
// Arabic. It does not cover Chinese, Japanese, Korean or Burmese, and pdf-lib
// does no bidirectional reordering or Arabic joining, so Persian and Urdu
// would come out as disconnected letters in the wrong order. Rather than print
// something that looks like text and isn't, callers run user-supplied strings
// through safe() and substitute what can't honestly be drawn.

const FONT_PATH = join(process.cwd(), "app/pdf/DejaVuSans.ttf");
const FONT_BYTES = readFileSync(FONT_PATH);

// A second, independent read of the same file. pdf-lib's PDFFont has no
// "do you have this character" method — it will happily encode a codepoint it
// has no glyph for and draw nothing — so coverage is asked of fontkit
// directly.
const COVERAGE = fontkit.create(FONT_BYTES);

/** True when every character in the string has a glyph, and none of it is in a
    script we can't lay out correctly (Arabic and Hebrew need joining and
    right-to-left reordering, neither of which pdf-lib does). */
export function drawable(text: string): boolean {
  for (const character of text) {
    const code = character.codePointAt(0);
    if (code === undefined) continue;
    if (code === 10 || code === 13 || code === 9) continue;
    if (!COVERAGE.hasGlyphForCodePoint(code)) return false;
    // Arabic, Arabic Supplement/Extended, Hebrew, and the presentation forms.
    if (
      (code >= 0x0590 && code <= 0x08ff) ||
      (code >= 0xfb1d && code <= 0xfdff) ||
      (code >= 0xfe70 && code <= 0xfeff)
    ) {
      return false;
    }
  }
  return true;
}

/** Replaces anything undrawable with `fallback`, and says whether it had to.
    Callers surface that: a document that quietly dropped a field is worse than
    one that says which field it dropped and where to read it instead. */
export function safe(
  text: string,
  fallback: string,
): { text: string; substituted: boolean } {
  const trimmed = text.trim();
  if (trimmed === "") return { text: "", substituted: false };
  return drawable(trimmed)
    ? { text: trimmed, substituted: false }
    : { text: fallback, substituted: true };
}

export const PAGE_WIDTH = 612;
export const PAGE_HEIGHT = 792;
export const MARGIN = 54;
export const CONTENT = PAGE_WIDTH - MARGIN * 2;
export const INK = rgb(0.11, 0.11, 0.1);
export const MUTED = rgb(0.42, 0.42, 0.4);
export const RULE = rgb(0.82, 0.82, 0.79);

/** Starts a document with the shared font registered. */
export async function newDocument(): Promise<{ doc: PDFDocument; font: PDFFont }> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(FONT_BYTES, { subset: true });
  return { doc, font };
}

/** One column of a table row: the text, how wide it is, and which edge it
    hangs off. Numbers right-align so a column of money lines up on the
    decimal point. */
export type Cell = {
  text: string;
  width: number;
  align?: "left" | "right";
  size?: number;
  color?: ReturnType<typeof rgb>;
};

// The cursor is a page plus a baseline. Everything that draws moves it down
// and asks for a new page when it runs out of room, so no caller has to know
// where it is on the sheet.
export class Sheet {
  private readonly doc: PDFDocument;
  private readonly font: PDFFont;
  page: PDFPage;
  y: number;

  constructor(doc: PDFDocument, font: PDFFont) {
    this.doc = doc;
    this.font = font;
    this.page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  /** Start a new page unless `height` still fits under the cursor. Callers
      pass the height of a whole block, not of one line — see row(). */
  private room(height: number) {
    if (this.y - height >= MARGIN) return;
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  gap(height: number) {
    this.y -= height;
  }

  private wrap(value: string, size: number, indent: number, width = CONTENT - indent): string[] {
    const fits = (text: string) => this.font.widthOfTextAtSize(text, size) <= width;

    // A run with no space in it can still be wider than the column — a pasted
    // URL, a 120-character employer name, or a language that doesn't put
    // spaces between words. Wrapping on spaces alone would put it on a line of
    // its own and let it run off the right edge of the paper, where it is not
    // merely ugly but gone. So anything that can't fit is cut at the last
    // character that does.
    const chop = (word: string): string[] => {
      if (fits(word)) return [word];
      const pieces: string[] = [];
      let piece = "";
      for (const character of word) {
        if (piece !== "" && !fits(piece + character)) {
          pieces.push(piece);
          piece = "";
        }
        piece += character;
      }
      if (piece !== "") pieces.push(piece);
      return pieces;
    };

    const lines: string[] = [];
    for (const paragraph of value.split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean).flatMap(chop)) {
        const candidate = line ? `${line} ${word}` : word;
        if (fits(candidate) || line === "") {
          line = candidate;
          continue;
        }
        lines.push(line);
        line = word;
      }
      lines.push(line);
    }
    return lines;
  }

  /** How tall this string will be once wrapped. Used to decide a page break
      before drawing anything, rather than discovering it halfway down a
      paragraph. */
  measure(value: string, { size = 10, indent = 0, leading = 1.45 } = {}): number {
    return this.wrap(value, size, indent).length * size * leading;
  }

  /** Word-wrapped text. Returns nothing; the cursor is the output. */
  text(value: string, { size = 10, color = INK, indent = 0, leading = 1.45 } = {}) {
    const lineHeight = size * leading;
    for (const line of this.wrap(value, size, indent)) {
      this.room(lineHeight);
      this.y -= lineHeight;
      this.page.drawText(line, {
        x: MARGIN + indent,
        y: this.y,
        size,
        font: this.font,
        color,
      });
    }
  }

  // A heading reserves room for itself *and* for a first row, so a section
  // title can never be the last thing on a page with its contents overleaf.
  heading(value: string) {
    this.room(34 + 40);
    this.gap(14);
    this.text(value.toUpperCase(), { size: 9, color: MUTED });
    this.y -= 5;
    this.rule();
    this.gap(3);
  }

  rule(color = RULE) {
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y },
      thickness: 0.7,
      color,
    });
  }

  /** A label and its answer. The two are measured together and moved together:
      an employer's name at the foot of one page with the job overleaf is how a
      printed stack turns into a puzzle. */
  row(label: string, value: string) {
    const shown = value.trim() === "" ? "—" : value;
    const height =
      6 + this.measure(label, { size: 8 }) + this.measure(shown, { size: 10.5 });
    // Capped at a full column: an answer longer than one page has to break
    // somewhere, and text() will do it line by line.
    this.room(Math.min(height, PAGE_HEIGHT - MARGIN * 2));
    this.gap(6);
    this.text(label, { size: 8, color: MUTED });
    this.text(shown, { size: 10.5 });
  }

  /** An answer with no label of its own, for the sections where the heading
      has already said what it is. */
  value(text: string) {
    const shown = text.trim() === "" ? "—" : text;
    this.room(Math.min(6 + this.measure(shown, { size: 10.5 }), PAGE_HEIGHT - MARGIN * 2));
    this.gap(6);
    this.text(shown, { size: 10.5 });
  }

  /** A row of columns, wrapped inside each column and kept together.
   *
   *  Each cell wraps within its own width and the whole row moves to the next
   *  page as a unit, so a line item's quantity is never on a different sheet
   *  from the thing being ordered. */
  columns(cells: Cell[], { leading = 1.45, padding = 5 } = {}) {
    const laid = cells.map((cell) => {
      const size = cell.size ?? 10;
      return {
        ...cell,
        size,
        lines: this.wrap(cell.text, size, 0, cell.width),
        lineHeight: size * leading,
      };
    });
    const height = Math.max(...laid.map((cell) => cell.lines.length * cell.lineHeight));
    this.room(Math.min(height + padding, PAGE_HEIGHT - MARGIN * 2));
    this.gap(padding);

    const top = this.y;
    let x = MARGIN;
    for (const cell of laid) {
      let y = top;
      for (const line of cell.lines) {
        y -= cell.lineHeight;
        const width = this.font.widthOfTextAtSize(line, cell.size);
        this.page.drawText(line, {
          x: cell.align === "right" ? x + cell.width - width : x,
          y,
          size: cell.size,
          font: this.font,
          color: cell.color ?? INK,
        });
      }
      x += cell.width;
    }
    this.y = top - height;
  }
}
