import { readFileSync } from "node:fs";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";

// The shared half of every PDF this app prints: a page size, a palette, a font
// that can draw more than Latin-1, and a cursor that knows when to turn over.
//
// Split out of applicationPdf.ts when the job descriptions needed printing
// too. That second document is gone, so this has one caller again, and it
// stays split anyway: the page mechanics and the application's own layout are
// different jobs, and the file that draws a form is easier to read without a
// wrapping engine in the middle of it.
//
// ——— The font, and what it can't draw ———
//
// DejaVu Sans is bundled next to the apply route (Bitstream Vera licence, see
// DejaVuSans-LICENSE.txt) and traced into the build by next.config.ts. Every
// route that renders a PDF needs its own entry in outputFileTracingIncludes —
// the trace is per route, so a new endpoint that reads this file will work
// locally and fail on the server without one.
//
// pdf-lib's built-in Helvetica encodes WinAnsi only and *throws* on anything
// outside it, which would mean an application from somebody named Nguyễn
// taking the whole endpoint down.

const FONT_PATH = join(process.cwd(), "app/api/apply/DejaVuSans.ttf");
export const FONT_BYTES = readFileSync(FONT_PATH);

/** A document with the font already embedded, and a cursor on page one. */
export async function newSheet(): Promise<{ doc: PDFDocument; sheet: Sheet }> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(FONT_BYTES, { subset: true });
  return { doc, sheet: new Sheet(doc, font) };
}

export const PAGE_WIDTH = 612;
export const PAGE_HEIGHT = 792;
export const MARGIN = 54;
const CONTENT = PAGE_WIDTH - MARGIN * 2;
export const INK = rgb(0.11, 0.11, 0.1);
export const MUTED = rgb(0.42, 0.42, 0.4);
export const RULE = rgb(0.82, 0.82, 0.79);

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

  private wrap(value: string, size: number, indent: number): string[] {
    const width = CONTENT - indent;
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
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y },
      thickness: 0.7,
      color: RULE,
    });
    this.gap(3);
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
}
