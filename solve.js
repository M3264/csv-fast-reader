// Fast drop-in for csv-reader 1.0.0: run(input) returns exactly readCsv's answer
// for every input {text, header} -> {columns, rows, errors}.
//
// Same left-to-right policy as the reference (BOM drop, LF/CRLF records, blank
// lines skipped, stray-CR drop, quoted fields with "" escapes and CR/CRLF->LF,
// quote_junk / unterminated_quote recovery, short_row / long_row padding and
// cuts, error records {code, line, row} in meeting order), but scanned in
// native-speed chunks instead of one character at a time:
//
// - fields are sliced out of the text (charCodeAt scan, slice at delimiters)
//   instead of concatenated character by character;
// - quoted bodies jump quote-to-quote with indexOf and only walk the gaps;
// - unquoted runs jump delimiter-to-delimiter;
// - no per-character closures, no per-field RegExp, one pass, no preprocessing.

/** Field ended at a comma (record goes on). */
const COMMA = 0;
/** Field ended at a line break (record ends). */
const BREAK = 1;
/** Field ended at the end of the text (record ends). */
const END = 2;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = n > 0 && text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;

  function err(code, rl, rr) {
    errors.push({ code, line: rl, row: rr });
  }

  // Reads an unquoted field body starting at pos, prepended with `first`
  // (characters already kept, not counted in `added`). Stops after a comma,
  // a line break, or the end of the text. A CR not followed by LF is dropped
  // with a stray_cr error. Returns [value, ended, added].
  function readUnquoted(first, rl, rr) {
    let parts = null;
    let seg = pos;
    let added = 0;
    for (;;) {
      // Jump to the next delimiter: comma, LF or CR.
      let i = pos;
      while (i < n) {
        const c = text.charCodeAt(i);
        if (c === 44 || c === 10 || c === 13) break;
        i++;
      }
      pos = i;
      if (pos >= n) {
        added += pos - seg;
        const tail = text.slice(seg, pos);
        return [parts === null ? first + tail : (parts.push(tail), parts.join('')), END, added];
      }
      const c = text.charCodeAt(pos);
      if (c === 44) {
        added += pos - seg;
        const tail = text.slice(seg, pos);
        pos++;
        return [parts === null ? first + tail : (parts.push(tail), parts.join('')), COMMA, added];
      }
      if (c === 10) {
        added += pos - seg;
        const tail = text.slice(seg, pos);
        pos++;
        line++;
        return [parts === null ? first + tail : (parts.push(tail), parts.join('')), BREAK, added];
      }
      // CR: CRLF ends the field, a lone CR is dropped with an error.
      if (pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
        added += pos - seg;
        const tail = text.slice(seg, pos);
        pos += 2;
        line++;
        return [parts === null ? first + tail : (parts.push(tail), parts.join('')), BREAK, added];
      }
      if (parts === null) parts = [first];
      parts.push(text.slice(seg, pos));
      added += pos - seg;
      err('stray_cr', rl, rr);
      pos++;
      seg = pos;
    }
  }

  for (;;) {
    // Lines with no characters are no records (LF and CRLF only).
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos++;
        line++;
      } else if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line++;
      } else break;
    }
    if (pos >= n) break;

    const recordLine = line;
    const recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let cont = true;
    let lastQuoted = false;
    while (cont) {
      cont = false;
      let value;
      let ended;
      if (text.charCodeAt(pos) === 34) {
        lastQuoted = true;
        const open = pos;
        const openLine = line;
        pos++;
        // Scan the quoted body quote-to-quote.
        let parts = null;
        let seg = pos;
        let closed = false;
        for (;;) {
          const q = text.indexOf('"', pos);
          if (q < 0) {
            // No more quotes: walk the rest for line counting, then fail.
            let i = pos;
            while (i < n) {
              const c = text.charCodeAt(i);
              if (c === 10) line++;
              else if (c === 13) line++;
              i++;
            }
            pos = n;
            break;
          }
          // Count line breaks in [pos, q): LF, CRLF (once) and lone CR.
          let i = pos;
          while (i < q) {
            const c = text.charCodeAt(i);
            if (c === 10) {
              line++;
              i++;
            } else if (c === 13) {
              line++;
              i += i + 1 < n && text.charCodeAt(i + 1) === 10 ? 2 : 1;
            } else i++;
          }
          if (q + 1 < n && text.charCodeAt(q + 1) === 34) {
            if (parts === null) parts = [];
            parts.push(text.slice(seg, q), '"');
            pos = q + 2;
            seg = pos;
            continue;
          }
          if (parts === null) {
            // Fast path: no escapes seen; slice the body whole and fix
            // embedded CR/CRLF to LF only when one is present.
            const body = text.slice(seg, q);
            value = body.indexOf('\r') < 0 ? body : body.replace(/\r\n?/g, '\n');
          } else {
            parts.push(text.slice(seg, q));
            value = parts.join('');
            // Embedded CR/CRLF in the gaps was already normalized chunk by
            // chunk below; normalize any raw chunk's remainder here.
            if (value.indexOf('\r') >= 0) value = value.replace(/\r\n?/g, '\n');
          }
          pos = q + 1;
          closed = true;
          break;
        }
        if (!closed) {
          // The quote never closes: literal character, rescan as unquoted.
          pos = open + 1;
          line = openLine;
          err('unterminated_quote', recordLine, recordRow);
          const r = readUnquoted('"', recordLine, recordRow);
          value = r[0];
          ended = r[1];
        } else if (pos >= n) {
          ended = END;
        } else {
          const d = text.charCodeAt(pos);
          if (d === 44) {
            pos++;
            ended = COMMA;
          } else if (d === 10) {
            pos++;
            line++;
            ended = BREAK;
          } else if (d === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
            pos += 2;
            line++;
            ended = BREAK;
          } else {
            // Trailing junk up to the next comma or line break.
            const r = readUnquoted(value, recordLine, recordRow);
            if (r[2] > 0) err('quote_junk', recordLine, recordRow);
            value = r[0];
            ended = r[1];
          }
        }
      } else {
        lastQuoted = false;
        const r = readUnquoted('', recordLine, recordRow);
        value = r[0];
        ended = r[1];
      }
      fields.push(value);
      if (ended === COMMA) cont = true;
    }

    // A line left with no characters is no record (stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
