#if os(iOS)
import CoreText
import SwiftUI
import UIKit
import XCTest
@testable import FPUI
import FPCore

/// Inline bold survives (it maps to the bold face whatever weight the line has) and no link is
/// ever created from model text.
final class InlineTests: XCTestCase {
    private let hw = RoomTheme.defaults(.heavyweight)
    private let lime = RoomTheme.defaults(.lime)

    func testBoldItalicAndCodeMapToTheirFaces() {
        let runs: Inline = [Run("Intro "), Run("bold", bold: true), Run(" and "), Run("em", italic: true), Run(" and "),
                            Run("code", code: true), Run(" "), Run("both", bold: true, italic: true)]
        for (theme, body, mono) in [(hw, "ArchivoFP", "ArchivoFP"), (lime, "InterFP", "JetBrainsMonoFP")] {
            let f = CoachInline.faces(runs, style: paraStyle, theme: theme)
            XCTAssertEqual(f.map(\.run.text), ["Intro ", "bold", " and ", "em", " and ", "code", " ", "both"])
            XCTAssertEqual(f[0].font.fontName, body + "-Regular")
            XCTAssertEqual(f[1].font.fontName, body + "-Bold", "bold survives in \(theme.flavor)")
            XCTAssertEqual(f[3].font.fontName, body + "-Regular", "italic is the upright face, slanted")
            XCTAssertEqual(CTFontGetMatrix(f[3].font as CTFont).c, tan(14 * CGFloat.pi / 180), accuracy: 0.0001)
            XCTAssertEqual(f[5].font.fontName, mono + "-Regular")
            XCTAssertEqual(f[5].font.pointSize, 15 * 0.9, accuracy: 0.001, "code is .9em")
            XCTAssertEqual(f[5].text, CoachInline.codePad + "code" + CoachInline.codePad)
            XCTAssertEqual(f[7].font.fontName, body + "-Bold")
            XCTAssertNotEqual(CTFontGetMatrix(f[7].font as CTFont).c, 0)
        }
    }

    func testBoldSurvivesUnderAHeavierLine() {
        // the owner's bubble is 500; a bold run in a 500 line is still the bold face
        let style = InlineStyle(size: 15, weight: 500, color: .onUserBubble)
        let f = CoachInline.faces([Run("a "), Run("b", bold: true)], style: style, theme: hw)
        XCTAssertEqual(f[0].font.fontName, "ArchivoFP-Medium")
        XCTAssertEqual(f[1].font.fontName, "ArchivoFP-Bold")
        let heavy = InlineStyle(size: 9, weight: 800, color: .eyebrow)
        XCTAssertEqual(CoachInline.faces([Run("x", bold: true)], style: heavy, theme: hw)[0].font.fontName, "ArchivoFP-ExtraBold",
                       "bold never lightens an 800 line")
    }

    func testNoLinkIsEverCreated() throws {
        let tricky: Inline = [Run("See [the docs](https://example.com/x) or https://example.com and www.example.com "),
                              Run("**not bold**"), Run(" mail me@example.com, call +1 555 0100", bold: true),
                              Run("[x](javascript:alert(1))", code: true)]
        var all: [Inline] = [tricky]
        for (_, body) in try CoachFixtures.grammar() {
            switch body {
            case .markdown(let blocks): all += blocks.flatMap(Self.runs)
            case .coach(let sections, _):
                for s in sections {
                    switch s {
                    case .markdown(let blocks): all += blocks.flatMap(Self.runs)
                    case .takeaway(let r): all.append(r)
                    default: break
                    }
                }
            default: break
            }
        }
        XCTAssertGreaterThan(all.count, 10)
        for runs in all {
            for theme in [hw, lime] {
                let a = CoachInline.attributed(runs, style: paraStyle, theme: theme)
                for run in a.runs {
                    XCTAssertNil(run.link, "no link in \(String(a.characters))")
                }
                // the text goes in verbatim: markdown syntax stays as written
                XCTAssertEqual(String(a.characters).replacingOccurrences(of: CoachInline.codePad, with: ""), runs.merged.map(\.text).joined())
            }
        }
        // the page's own grammar case keeps a non-http link as its literal text
        let edges = try XCTUnwrap(CoachFixtures.grammar().first { $0.0 == "inline-edges" }?.1)
        XCTAssertTrue(edges.plainText.contains("[not this](ftp://x)"))
        XCTAssertTrue(edges.plainText.contains("A link is its text"))
    }

    func testInlineEdgesCaseKeepsEveryStyle() throws {
        let edges = try XCTUnwrap(CoachFixtures.grammar().first { $0.0 == "inline-edges" }?.1)
        guard case .markdown(let blocks) = edges, case .paragraph(let runs) = blocks.first else { return XCTFail("inline-edges is one paragraph") }
        let f = CoachInline.faces(runs, style: paraStyle, theme: hw)
        let bold = f.filter { $0.run.bold && !$0.run.code }
        XCTAssertFalse(bold.isEmpty)
        XCTAssertTrue(bold.allSatisfy { $0.font.fontName == "ArchivoFP-Bold" })
        let boldCode = f.filter { $0.run.bold && $0.run.code }
        XCTAssertFalse(boldCode.isEmpty)
        XCTAssertTrue(boldCode.allSatisfy { $0.font.fontName == "ArchivoFP-Bold" && abs($0.font.pointSize - 13.5) < 0.01 })
    }

    private static func runs(_ b: MarkdownBlock) -> [Inline] {
        switch b {
        case .paragraph(let r), .heading(let r): return [r]
        case .bullets(let items), .numbered(_, let items): return items.map(\.runs)
        case .table(let rows): return rows.flatMap { $0 }
        case .rule, .unknown: return []
        }
    }
}
#endif
