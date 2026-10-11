#if os(iOS)
import SwiftUI
import UIKit

// Layouts and glyphs the chat shares (plan task C6). The web lays these parts out with CSS flex
// wrapping (`flex-wrap: wrap` with a gap), an auto-layout table at 100% width, and inline SVG icons;
// these are their SwiftUI counterparts.

/// A row that wraps to new lines, as `display:flex; flex-wrap:wrap; gap:…` does: each child at its
/// ideal width, or the line's width when it is wider (its text then wraps inside it).
struct FlowLayout: Layout {
    var spacing: CGFloat
    var lineSpacing: CGFloat

    private func sizes(_ subviews: Subviews, width: CGFloat) -> [CGSize] {
        subviews.map { s in
            let ideal = s.sizeThatFits(.unspecified)
            if ideal.width <= width { return ideal }
            return s.sizeThatFits(ProposedViewSize(width: width, height: nil))
        }
    }

    /// The origin of every child and the size of the whole.
    private func arrange(_ sizes: [CGSize], width: CGFloat) -> ([CGPoint], CGSize) {
        var points: [CGPoint] = []
        var x: CGFloat = 0, y: CGFloat = 0, lineHeight: CGFloat = 0, widest: CGFloat = 0
        for size in sizes {
            if x > 0, x + size.width > width + 0.5 {
                y += lineHeight + lineSpacing
                x = 0
                lineHeight = 0
            }
            points.append(CGPoint(x: x, y: y))
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
            widest = max(widest, x - spacing)
        }
        return (points, CGSize(width: widest, height: sizes.isEmpty ? 0 : y + lineHeight))
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        let s = sizes(subviews, width: width)
        let (_, size) = arrange(s, width: width)
        return CGSize(width: proposal.width.map { min($0, size.width) } ?? size.width, height: size.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let s = sizes(subviews, width: bounds.width)
        let (points, _) = arrange(s, width: bounds.width)
        for (i, sub) in subviews.enumerated() {
            sub.place(at: CGPoint(x: bounds.minX + points[i].x, y: bounds.minY + points[i].y),
                      proposal: ProposedViewSize(width: s[i].width, height: s[i].height))
        }
    }
}

/// A table as the browser's auto layout draws `table{width:100%}` with `white-space:nowrap` cells:
/// each column as wide as its widest cell, the rows as tall as their tallest cell, and when the
/// table is narrower than the space offered, the extra width shared by the columns in proportion to
/// their width. Cells come in row order; a short row leaves its last cells empty.
struct TableLayout: Layout {
    /// Cells per row, in order (rows may be shorter than the widest).
    var rowCounts: [Int]

    struct Cache {
        var columns: [CGFloat] = []
        var rows: [CGFloat] = []
    }

    private var columnCount: Int { rowCounts.max() ?? 0 }

    func makeCache(subviews: Subviews) -> Cache {
        var cache = Cache(columns: Array(repeating: 0, count: columnCount), rows: Array(repeating: 0, count: rowCounts.count))
        var i = 0
        for (r, n) in rowCounts.enumerated() {
            for c in 0..<n where i < subviews.count {
                let size = subviews[i].sizeThatFits(.unspecified)
                cache.columns[c] = max(cache.columns[c], size.width)
                cache.rows[r] = max(cache.rows[r], size.height)
                i += 1
            }
        }
        return cache
    }

    private func columns(_ cache: Cache, width: CGFloat?) -> [CGFloat] {
        let natural = cache.columns.reduce(0, +)
        guard let width, width > natural, natural > 0 else { return cache.columns }
        let extra = width - natural
        return cache.columns.map { $0 + extra * $0 / natural }
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout Cache) -> CGSize {
        let natural = cache.columns.reduce(0, +)
        let width = proposal.width.map { $0.isFinite ? max($0, natural) : natural } ?? natural
        return CGSize(width: width, height: cache.rows.reduce(0, +))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout Cache) {
        let cols = columns(cache, width: bounds.width)
        var i = 0
        var y = bounds.minY
        for (r, n) in rowCounts.enumerated() {
            var x = bounds.minX
            for c in 0..<n where i < subviews.count {
                subviews[i].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(width: cols[c], height: cache.rows[r]))
                x += cols[c]
                i += 1
            }
            y += cache.rows[r]
        }
    }
}

/// The page's SVG icons, drawn from their own path data in a 24-unit box.
enum ChatGlyph {
    /// The send arrow (Material "send"): M2.01 21L23 12 2.01 3 2 10l15 2-15 2z.
    struct Send: Shape {
        func path(in r: CGRect) -> Path {
            let k = min(r.width, r.height) / 24
            func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: r.minX + x * k, y: r.minY + y * k) }
            var path = Path()
            path.move(to: p(2.01, 21))
            path.addLine(to: p(23, 12))
            path.addLine(to: p(2.01, 3))
            path.addLine(to: p(2, 10))
            path.addLine(to: p(17, 12))
            path.addLine(to: p(2, 14))
            path.closeSubpath()
            return path
        }
    }

    /// The photo icon: a rounded square, a sun and a hill (stroked).
    struct Photo: Shape {
        func path(in r: CGRect) -> Path {
            let k = min(r.width, r.height) / 24
            func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: r.minX + x * k, y: r.minY + y * k) }
            var path = Path(roundedRect: CGRect(x: r.minX + 3 * k, y: r.minY + 3 * k, width: 18 * k, height: 18 * k), cornerRadius: 2 * k)
            path.addEllipse(in: CGRect(x: r.minX + 7 * k, y: r.minY + 7 * k, width: 3 * k, height: 3 * k))
            path.move(to: p(21, 15))
            path.addLine(to: p(16, 10))
            path.addLine(to: p(5, 21))
            return path
        }
    }

    /// Back's chevron: polyline 15 18, 9 12, 15 6.
    struct Chevron: Shape {
        func path(in r: CGRect) -> Path {
            let k = min(r.width, r.height) / 24
            var path = Path()
            path.move(to: CGPoint(x: r.minX + 15 * k, y: r.minY + 18 * k))
            path.addLine(to: CGPoint(x: r.minX + 9 * k, y: r.minY + 12 * k))
            path.addLine(to: CGPoint(x: r.minX + 15 * k, y: r.minY + 6 * k))
            return path
        }
    }
}

/// A button drawn smaller than it is pressed (the web's .kt-hit on the model switch): the press
/// reaches `h` and `v` points past the drawn label on each side, so a control drawn smaller than
/// 44 pt still takes a 44 pt press, and the layout gives the padding back, so the control sits
/// where it is drawn.
///
/// The padding and the press shape go inside the Button's label: a Button is pressed where its
/// label is, and a content shape wrapped around the finished Button widens only the frame
/// VoiceOver reports, never what a finger can press (clicked on this same source, the wrapped one
/// took presses only on the drawn pill; PressAreaTests holds the structure).
struct PressAreaButton<Label: View, PressShape: Shape>: View {
    let h: CGFloat
    let v: CGFloat
    let shape: PressShape
    let action: () -> Void
    let label: Label

    init(h: CGFloat, v: CGFloat, shape: PressShape, action: @escaping () -> Void, @ViewBuilder label: () -> Label) {
        self.h = h
        self.v = v
        self.shape = shape
        self.action = action
        self.label = label()
    }

    var body: some View {
        Button(action: action) {
            label
                .padding(.horizontal, h)
                .padding(.vertical, v)
                .contentShape(shape)
        }
        .buttonStyle(PressDim())
        .padding(.horizontal, -h)
        .padding(.vertical, -v)
    }
}

extension PressAreaButton where PressShape == Rectangle {
    init(h: CGFloat, v: CGFloat, action: @escaping () -> Void, @ViewBuilder label: () -> Label) {
        self.init(h: h, v: v, shape: Rectangle(), action: action, label: label)
    }
}

extension View {
    /// One CSS hairline along an edge of the view (the header's rule, a ledger row's border).
    func hairline(_ color: Color, edge: Alignment = .bottom, width: CGFloat = 1) -> some View {
        overlay(alignment: edge) { Rectangle().fill(color).frame(height: width) }
    }
}
#endif
