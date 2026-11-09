#if os(iOS)
import CoreFoundation
import Foundation

/// Where the phone's web view may end a line of the page's text: WebKit's break opportunities in `white-space: normal`
/// text that sets no `word-break`, `line-break` or `hyphens` of its own (the Coach hub's meta label, the headline's
/// h1), found as the runtime's WebKit finds them (BreakablePositions.h's `nextBreakablePosition` with its Normal rules,
/// read 2026-11-03; iOS 26's WebKit had them before quotes had sides: `quoteSides`). A line may end at a space, which
/// hangs (part of neither line); between two characters up to U+00FF only where WebKit's own table has a break
/// (`table`): after a hyphen ("STRENGTH-" over "ENDURANCE"), after a question mark, before an opening bracket after
/// other punctuation, never after a slash before a letter or a digit ("HYPERTROPHY/STRENGTH" is one piece) and never
/// between letters and digits; past U+00FF by WebKit's classes for the plain cases (letters, ideographs, quotes,
/// brackets, combining marks) and otherwise by ICU's line breaker over the whole text (`CFStringTokenizer`), which
/// WebKit then trusts across the letters that follow, up to ICU's next break.
/// CoreText's typesetter breaks by Unicode's rules alone (UAX #14): it broke the meta label after its slash, "… ·
/// HYPERTROPHY/" over "STRENGTH", where the page breaks before the name, and never at a space before "/", ")", "!"
/// or "?", where the page may ("UPPER" over "/ LOWER"). Probed 2026-11-03 in a zero-width box: of the 8,836 pairs of
/// printable ASCII characters WebKit 26.5 (iOS 26.5's own and Playwright's on the Mac, alike) breaks 423 otherwise
/// than the typesetter, and Chromium (the suite's) agrees with WebKit on all but nine, after a hyphen ("-/", "-)" and
/// the like); over 45,669 strings (every pair of characters from `!` to U+00FF, each after a space, and 22 characters
/// past it, from dashes to ideographs and an emoji, beside all of those) this gives WebKit 26.5's breaks, every one,
/// and iOS 27.0's web view breaks 320 of them otherwise, all beside a curly quote or a guillemet, as `quoteSides` has
/// it. CoachHomeViewTests holds `breaks` to the web view of the runtime it runs on.
enum WebLineBreaks {
    /// Where a line of `text` may end, as the UTF-16 offsets at which the next line starts, in order (never 0 or the
    /// text's length): past a space (the break is before it and the space hangs; white space should be collapsed to
    /// single spaces first) and wherever WebKit has a breakable position.
    static func breaks(in text: String, quoteSides: Bool = WebLineBreaks.quoteSides) -> [Int] {
        let s = Array(text.utf16)
        guard s.count > 1 else { return [] }
        let icu = ICU(text)
        var out: [Int] = []
        var at = 1   // never before the first character: WebKit's start of the text with no context before it
        while at < s.count {
            let p = next(s, from: at, icu: icu, sides: quoteSides)
            guard p < s.count else { break }
            out.append(isBreakableSpace(s[p]) ? p + 1 : p)
            at = p + 1
        }
        return out
    }

    /// The pieces no break divides (`breaks`), in order, each without the spaces it ends on: the widest is the text's
    /// min-content width, the narrowest the text can be laid out without running past its box.
    static func pieces(of text: String) -> [String] {
        let units = text as NSString
        var out: [String] = [], from = 0
        for end in breaks(in: text) + [units.length] {
            let piece = units.substring(with: NSRange(location: from, length: end - from)).trimmingCharacters(in: spaces)
            if !piece.isEmpty { out.append(piece) }
            from = end
        }
        return out
    }

    /// WebKit's next breakable position at or after `start` (1 or more), the text's length when there is none: its
    /// `nextBreakablePosition` for normal line breaking (no break-all, keep-all or breaking no-break spaces). Each call
    /// asks ICU afresh, as each of WebKit's does.
    private static func next(_ s: [UInt16], from start: Int, icu: ICU, sides: Bool) -> Int {
        var i = start
        var beforeBefore: UInt16 = i > 1 ? s[i - 2] : 0
        var before = (ch: s[i - 1], type: UInt16(0)), after = (ch: UInt16(0), type: UInt16(0))
        var nextBreak: Int?
        func advance() { beforeBefore = before.ch; before = after; i += 1 }
        while i < s.count {
            after = (s[i], 0)
            if isBreakableSpace(after.ch) { return i }
            // ASCII and Latin-1: a hyphen before a digit is a minus sign unless a letter or digit comes before it
            // ("ABCD-1234", "1234-5678" break; "-1", "(-1" do not); any other pair is the table's
            if before.ch == 0x2D, (0x30...0x39).contains(after.ch) {
                if alphanumeric(beforeBefore) { return i }
                advance(); continue
            }
            if before.ch <= 0xFF, after.ch <= 0xFF {
                if before.ch >= 0x21, after.ch >= 0x21, table[tableClass(before.ch)][tableClass(after.ch)] { return i }
                advance(); continue   // else a space or a control character: no break here
            }
            // past U+00FF: WebKit's classes settle the plain cases
            if before.type == 0 { before.type = classify(before.ch, sides: sides) }
            after.type = classify(after.ch, sides: sides)
            let pair = before.type | after.type
            if pair & ~(SP | AL | QU | Pi | Pf) == 0 { advance(); continue }   // letters, quotes
            if pair | AL == ID | AL { return i }   // an ideograph beside a letter or another ideograph
            if pair & (GL | QU) != 0, pair & weird == 0 {
                // no break beside glue or a quote, but before an initial quote or after a final one beside an ideograph
                if pair & ID != 0, pair & QU != 0, after.type & Pi != 0 || before.type & Pf != 0 { return i }
                advance(); continue
            }
            if after.type == CM { after.type = before.type; advance(); continue }   // a combining mark takes its base's
            if pair & weird == 0, pair & (CL | CP | OP) != 0 {
                if after.type == CL || after.type == CP || before.type == OP { advance(); continue }
                if pair & ID != 0 { return i }
            }
            // ICU, trusted across the ASCII letters and the characters past U+00FF that follow, up to its next break
            if nextBreak.map({ $0 < i }) ?? true { nextBreak = icu.following(i - 1) }
            if let nb = nextBreak, i < nb {
                while i < min(nb, s.count - 1) {
                    let lookahead = s[i + 1]
                    if lookahead <= 0xFF, !asciiLetter(lookahead) { break }
                    beforeBefore = before.ch; before = after; after = (lookahead, 0); i += 1
                }
            }
            if i == nextBreak, !isBreakableSpace(before.ch) { return i }
            advance()
        }
        return s.count
    }

    /// ICU's line breaks over the whole text (the ends of `kCFStringTokenizerUnitLineBreak`'s tokens), asked only past
    /// U+00FF and read once.
    private final class ICU {
        let text: String
        lazy var ends: [Int] = {
            let s = text as CFString
            let length = CFStringGetLength(s)
            guard let tokens = CFStringTokenizerCreate(nil, s, CFRange(location: 0, length: length), kCFStringTokenizerUnitLineBreak,
                                                       Locale(identifier: "en") as CFLocale) else { return [length] }
            var out: [Int] = []
            while CFStringTokenizerAdvanceToNextToken(tokens).rawValue != 0 {
                let r = CFStringTokenizerGetCurrentTokenRange(tokens)
                out.append(r.location + r.length)
            }
            return out.last == length ? out : out + [length]
        }()
        init(_ text: String) { self.text = text }

        /// The first break after `offset` (ICU's `following`): the text's length at the latest.
        func following(_ offset: Int) -> Int { ends.first { $0 > offset } ?? ends.last ?? 0 }
    }

    private static let spaces = CharacterSet(charactersIn: " ")

    /// WebKit's breakable spaces: space, tab, line feed and the line and paragraph separators (not a no-break space).
    private static func isBreakableSpace(_ c: UInt16) -> Bool { c == 0x20 || c == 0x0A || c == 0x09 || c == 0x2028 || c == 0x2029 }
    private static func asciiLetter(_ c: UInt16) -> Bool { (0x41...0x5A).contains(c) || (0x61...0x7A).contains(c) }
    private static func alphanumeric(_ c: UInt16) -> Bool { asciiLetter(c) || (0x30...0x39).contains(c) }

    // WebKit's break classes (UAX #14's, folded: HL as AL, H2 and H3 as ID, NU as AL); weird: ask ICU.
    private static let AL: UInt16 = 1, ID: UInt16 = 1 << 1, CM: UInt16 = 1 << 2, OP: UInt16 = 1 << 3, CP: UInt16 = 1 << 4
    private static let CL: UInt16 = 1 << 5, GL: UInt16 = 1 << 6, QU: UInt16 = 1 << 7, SP: UInt16 = 1 << 8
    private static let Pi: UInt16 = 1 << 9, Pf: UInt16 = 1 << 10, weird: UInt16 = 1 << 15

    /// Whether the runtime's WebKit gives quotes sides (initial, final): iOS 27's does, as WebKit's source has it
    /// (2026-11-03): the curly quotes and the guillemets are initial or final quotes, and a break falls before an
    /// initial one or after a final one beside an ideograph. iOS 26's WebKit (26.5) has the curly single quotes as plain
    /// quotes, the double ones left to ICU, the guillemets plain quotes, no break beside an ideograph. The two break 320
    /// of CoachHomeViewTests' 45,000-odd strings differently, every one beside such a quote.
    static var quoteSides: Bool {
        ProcessInfo.processInfo.isOperatingSystemAtLeast(OperatingSystemVersion(majorVersion: 27, minorVersion: 0, patchVersion: 0))
    }

    /// WebKit's `classify`: the class of a character for its shortcuts past U+00FF, the quotes with their sides or
    /// without (`quoteSides`).
    private static func classify(_ c: UInt16, sides: Bool) -> UInt16 {
        switch c {
        case 0x00...0x0F: return weird
        case 0x10...0x1F: return CM
        case 0x20: return SP
        case 0x22, 0x27: return QU
        case 0x28, 0x5B, 0x7B: return OP
        case 0x29, 0x5D: return CP
        case 0x7D: return CL
        case 0x30...0x39, 0x40...0x5A, 0x60...0x7A: return AL
        case 0x00...0x7F: return weird
        case 0xA0: return GL
        case 0xC1...0xFF: return AL
        case 0xA1, 0xBF: return OP
        case 0xAB: return sides ? QU | Pi : QU
        case 0xBB: return sides ? QU | Pf : QU
        case 0x80...0xFF: return weird
        case 0x0100...0x027F: return AL
        case 0x02C8, 0x02CC, 0x02DF: return weird
        case 0x0280...0x02FF: return AL
        case 0x034F, 0x035C...0x0362: return GL
        case 0x0300...0x036F: return CM
        case 0x037E: return weird
        case 0x0370...0x0482: return AL
        case 0x0483...0x0489: return CM
        case 0x048A...0x0588: return AL
        case 0x05C8...0x05FF: return AL
        case 0x0591...0x05BD, 0x05BF, 0x05C1, 0x05C2, 0x05C4, 0x05C5, 0x05C7: return CM
        case 0x0589...0x05FF: return weird
        case 0x0600...0x09FF, 0x1000...0x19FF: return weird
        case 0x2018: return sides ? QU | Pi : QU
        case 0x2019: return sides ? QU | Pf : QU
        case 0x201C: return sides ? QU | Pi : weird
        case 0x201D: return sides ? QU | Pf : weird
        case 0x3000...0x303F:
            switch c & 0x1F {
            case 0x01, 0x02, 0x09, 0x0B, 0x0D, 0x0F, 0x11, 0x15, 0x17, 0x19, 0x1B, 0x1E, 0x1F: return CL
            case 0x08, 0x0A, 0x0C, 0x0E, 0x10, 0x14, 0x16, 0x18, 0x1A, 0x1D: return OP
            default: return weird
            }
        case 0x3040...0x30FF, 0x31F0...0x31FF, 0xA015: return weird
        case 0x3248...0x324F, 0x4DC0...0x4DFF: return AL
        case 0x2E80...0xA4CF, 0xAC00...0xD7AF, 0xF900...0xFAFF: return ID
        default: return weird
        }
    }

    /// The class of a character from `!` to U+00FF in `table`: characters of one class break alike before and after
    /// every other one.
    private static func tableClass(_ c: UInt16) -> Int {
        switch c {
        case 0x21, 0x7D: return 0   // !}
        case 0x22: return 1   // "
        case 0x23, 0x26, 0x2A, 0x3D...0x3E, 0x7E: return 2   // #&*=>~
        case 0x24: return 3   // $
        case 0x25, 0x2B, 0x5C: return 4   // %+\
        case 0x27: return 5   // '
        case 0x28, 0x5B, 0x7B: return 6   // ([{
        case 0x29, 0x3A...0x3B, 0x5D: return 7   // ):;]
        case 0x2C, 0x2E: return 8   // ,.
        case 0x2D: return 9   // -
        case 0x2F: return 10   // /
        case 0x30...0x39: return 11   // 0123456789
        case 0x3C: return 12   // <
        case 0x3F: return 13   // ?
        case 0x40...0x5A, 0x5E...0x7A: return 14   // @ABCDEFGHIJK…uvwxyz
        case 0x7C: return 15   // |
        case 0x7F: return 16   // DEL
        case 0x80...0x84, 0x86...0x9F: return 17   // C1 controls
        case 0x85: return 18   // next line
        case 0xA0: return 19   // no-break space
        case 0xA1, 0xBF: return 20   // ¡¿
        case 0xA2...0xA5, 0xB0...0xB1: return 21   // ¢£¤¥°±
        case 0xA6...0xAA, 0xAC, 0xAE...0xAF, 0xB2...0xB3, 0xB5...0xBA, 0xBC...0xBE: return 22   // ¦§¨©ª¬®¯²³µ¶·¸¹º¼½¾
        case 0xAB, 0xBB: return 23   // «»
        case 0xAD: return 24   // soft hyphen
        case 0xB4: return 25   // ´
        case 0xC0...0xFF: return 26   // ÀÁÂÃÄÅÆÇÈÉÊË…úûüýþÿ
        default: return -1
        }
    }

    /// WebKit's table, by class: row the class before, column the class after, 1 a break.
    private static let table: [[Bool]] = [
        "000000100000100000001110011",
        "000000100000100000000000000",
        "000000100000100000000000010",
        "000000000000000000001100010",
        "000000100000100000001100010",
        "000000000000000000000000000",
        "000000000000000000000000000",
        "000000100000100000001100010",
        "000000100000100000001100010",
        "111111110110111110011100011",
        "000000000000000000001110011",
        "000000000000000000000000010",
        "000000000000000000000000010",
        "001110100101101110001110011",
        "000000000000000000000000010",
        "000000100000100000011110011",
        "000000000000000000000000010",
        "000000000000000000000000010",
        "111111111111111111111111111",
        "000000000000000000000000000",
        "000000000000000000000000000",
        "000110100000000000001100010",
        "000000000000000000000000010",
        "000000000000000000000000000",
        "001110100001101000011110011",
        "000000000000000000000000000",
        "000000000000000000000000010",
    ].map { $0.map { $0 == "1" } }
}
#endif
