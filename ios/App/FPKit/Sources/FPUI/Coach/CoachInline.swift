#if os(iOS)
import CoreText
import SwiftUI
import UIKit
import FPCore

/// Inline text as the page's md() writes it: runs of plain, bold, italic and code text (plan task
/// C6; FPCore Blocks.swift). Swift never parses markdown: the page hands over runs and this draws
/// them, each with its own face, so bold survives whatever weight the line around it has (the
/// research found AttributedString(markdown:) loses **bold** under a container font with a weight).
///
/// Nothing here ever makes a link: the runs' text goes in verbatim (no markdown is interpreted, no
/// data detector runs), and no `.link` attribute is ever set, so model text can never navigate out
/// of the app (the web's md() makes a link its text alone).
struct InlineStyle {
    var face: RoomTheme.Face = .body
    /// CSS px at the large size.
    var size: CGFloat
    var weight: Int = 400
    /// `<strong>` in the browser: bold (700) over a regular line, never lighter than the line.
    var boldWeight: Int? = nil
    var color: ColorToken = .text
    /// CSS letter-spacing in px (at the large size); nil = the room's default.
    var tracking: CGFloat? = nil
    var tabular: Bool = false
}

enum CoachInline {
    /// U+2009 THIN SPACE: the code chip's side padding (5 px in the web) drawn inside its background.
    static let codePad = "\u{2009}"

    /// Each run's text as drawn and its face: bold at 700 (never lighter than the line), italic
    /// slanted as WebKit slants it, code in the room's figures face at .9em (Heavyweight: Archivo
    /// with tabular figures) padded inside its chip.
    static func faces(_ runs: Inline, style: InlineStyle, theme: RoomTheme) -> [(text: String, font: UIFont, run: Run)] {
        var out: [(text: String, font: UIFont, run: Run)] = runs.merged.map { run in
            let weight = run.bold ? max(style.boldWeight ?? 700, style.weight) : style.weight
            if run.code {
                return (codePad + run.text + codePad, theme.uiFont(.mono, style.size * 0.9, weight, italic: run.italic), run)
            }
            return (run.text, theme.uiFont(style.face, style.size, weight, italic: run.italic, tabular: style.tabular), run)
        }
        // a slanted last letter leans past the text's end, where the text's own bounds would cut
        // it: a thin space gives it room (mid-line, the next letter's room takes the lean)
        if let last = out.indices.last, out[last].run.italic, !out[last].run.code {
            out[last].text += codePad
        }
        return out
    }

    /// The runs as one attributed string: each run its face, colour and tracking; code on the
    /// room's card2. Never a link.
    static func attributed(_ runs: Inline, style: InlineStyle, theme: RoomTheme) -> AttributedString {
        var out = AttributedString()
        let tracking = style.tracking.map(theme.px) ?? theme.bodyTracking
        for (text, font, run) in faces(runs, style: style, theme: theme) {
            var piece = AttributedString(text)
            piece.font = Font(font)
            piece.foregroundColor = theme.color(style.color)
            if tracking != 0 { piece.tracking = tracking }
            if run.code { piece.backgroundColor = theme.color(.card2) }
            out += piece
        }
        return out
    }

    /// The face of the line itself (for line-height math).
    static func baseFont(_ style: InlineStyle, theme: RoomTheme) -> UIFont {
        theme.uiFont(style.face, style.size, style.weight, tabular: style.tabular)
    }

    /// How much taller a `line-height: normal` line is in the browser when it holds a letter the
    /// face lacks (an arrow, a check): the fallback face's own ascent and descent stretch the line
    /// box. SwiftUI keeps the face's line, so the text takes the difference as padding.
    static func fallbackStretch(_ text: String, font: UIFont) -> (top: CGFloat, bottom: CGFloat) {
        let ct = font as CTFont
        var top: CGFloat = 0, bottom: CGFloat = 0
        var seen = Set<UnicodeScalar>()
        for scalar in text.unicodeScalars where scalar.value > 0x7F && !scalar.properties.isWhitespace && seen.insert(scalar).inserted {
            let s = String(scalar)
            var units = Array(s.utf16)
            var glyphs = [CGGlyph](repeating: 0, count: units.count)
            if CTFontGetGlyphsForCharacters(ct, &units, &glyphs, units.count) { continue }
            let fallback = CTFontCreateForString(ct, s as CFString, CFRange(location: 0, length: units.count))
            top = max(top, CTFontGetAscent(fallback) - CTFontGetAscent(ct))
            bottom = max(bottom, CTFontGetDescent(fallback) - CTFontGetDescent(ct))
        }
        return (top, bottom)
    }
}

/// A line (or lines) of runs, on CSS line boxes when `lineHeight` (a multiple of the size) is set.
struct InlineText: View {
    let runs: Inline
    let style: InlineStyle
    var lineHeight: CGFloat? = nil
    var alignment: TextAlignment = .leading
    @Environment(\.roomTheme) private var theme

    var body: some View {
        let text = Text(CoachInline.attributed(runs, style: style, theme: theme))
            .multilineTextAlignment(alignment)
            .fixedSize(horizontal: false, vertical: true)
        if let lineHeight {
            text.cssLineHeight(theme.px(style.size * lineHeight), font: CoachInline.baseFont(style, theme: theme))
        } else {
            text
        }
    }
}

/// Plain text in one face (labels, the owner's words, notes), verbatim: never markdown, never a link.
struct PlainText: View {
    let text: String
    let style: InlineStyle
    var lineHeight: CGFloat? = nil
    var uppercase = false
    var alignment: TextAlignment = .leading
    var lineLimit: Int? = nil
    @Environment(\.roomTheme) private var theme

    var body: some View {
        let font = CoachInline.baseFont(style, theme: theme)
        let tracking = style.tracking.map(theme.px) ?? theme.bodyTracking
        let t = Text(verbatim: uppercase ? text.uppercased() : text)
            .font(Font(font))
            .tracking(tracking)
            .foregroundStyle(theme.color(style.color))
            .multilineTextAlignment(alignment)
            .lineLimit(lineLimit)
        Group {
            if let lineHeight {
                t.cssLineHeight(theme.px(style.size * lineHeight), font: font)
            } else {
                let stretch = CoachInline.fallbackStretch(text, font: font)
                t.padding(.top, stretch.top).padding(.bottom, stretch.bottom)
            }
        }
        .fixedSize(horizontal: false, vertical: lineLimit == nil)
    }
}
#endif
