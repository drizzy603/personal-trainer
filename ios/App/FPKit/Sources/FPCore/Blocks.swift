import Foundation

// A chat message's body as the page models it (plan tasks C2 and C4; decision.md section 6).
//
// One parser per grammar, in the page: md() and _coachBlocksHTML() keep parsing the coach's text, and
// the page hands Swift their result as blocks. Swift never parses markdown or %% markers; it decodes
// these shapes and draws them. The block set is chatui/ui's (02d710e): md() writes paragraphs (a line
// break inside one), bullet lists (with sub-items) and numbered lists (with their start), headings,
// rules and pipe tables, and inline bold, italic and code with no links; _coachBlocksHTML() adds
// metric cards, the takeaway and up to two action chips around runs of markdown.
// Tools/blocks-fixtures.js builds Fixtures/blocks/page-grammar.json with the page's own functions.
//
// JSON:
//   body     "plain text"                                    the owner's words, the app's notes
//          | {"k":"md",  "blocks":[Block]}                   a prose reply (md())
//          | {"k":"cmb", "sections":[Section], "actions":[Action]}   a %% reply (_coachBlocksHTML())
//   Block    {"k":"p", "r":Runs}              paragraph; "\n" in a run is a line break
//          | {"k":"ul", "items":[{"r":Runs, "sub":true?}]}
//          | {"k":"ol", "start":3, "items":[{"r":Runs}]}
//          | {"k":"h", "r":Runs}             heading (every level looks the same)
//          | {"k":"hr"}
//          | {"k":"table", "rows":[[Runs]]}   the first row heads it
//   Section  {"k":"md", "blocks":[Block]}     the plain lines between two markers
//          | {"k":"metrics", "rows":[{"label","value","ref","delta","tone":"good|warn|plain"}]}
//          | {"k":"take", "r":Runs}           TAKEAWAY (one at most)
//   Action   {"label", "msg", "primary"}      a chip that sends msg (the page leaves them out on
//                                             older replies and while a reply is in flight)
//   Runs     ["plain", {"t":"bold", "s":"b"}, {"t":"x", "s":"bc"}, ...]   s: b bold, i italic, c code
//
// Strings are the web's DOM text (a metric label arrives upper-cased, as the page writes it); views
// apply only the case changes the web's CSS applies (eyebrows). A kind this build does not know (a
// newer page's) decodes as `.unknown`, drawn as its text: the block's own "text" when it has one (a
// kind added after v1 must carry it), else every string in it.

/// A run of inline text with its styles.
public struct Run: Equatable, Hashable, Sendable {
    public var text: String
    public var bold: Bool
    public var italic: Bool
    public var code: Bool

    public init(_ text: String, bold: Bool = false, italic: Bool = false, code: Bool = false) {
        self.text = text
        self.bold = bold
        self.italic = italic
        self.code = code
    }

    /// "b", "i", "c" in that order, for the styles the run has.
    public var styles: String { (bold ? "b" : "") + (italic ? "i" : "") + (code ? "c" : "") }

    public var isPlain: Bool { !bold && !italic && !code }

    /// A string (plain) or {t, s}. Unknown style letters are ignored; anything else is nil.
    public init?(json: JSONValue) {
        if let s = json.string { self.init(s); return }
        guard let t = json["t"]?.string else { return nil }
        let s = json["s"]?.string ?? ""
        self.init(t, bold: s.contains("b"), italic: s.contains("i"), code: s.contains("c"))
    }

    public var json: JSONValue { isPlain ? .string(text) : ["t": .string(text), "s": .string(styles)] }
}

/// A line (or lines) of styled runs.
public typealias Inline = [Run]

extension Array where Element == Run {
    /// The text without styles.
    public var plainText: String { map(\.text).joined() }

    /// Adjacent runs with the same styles joined.
    public var merged: [Run] {
        var out: [Run] = []
        for r in self where !r.text.isEmpty {
            if let last = out.last, last.styles == r.styles { out[out.count - 1].text += r.text } else { out.append(r) }
        }
        return out
    }

    /// From a JSON array of runs (a bare string reads as one plain run).
    public init(runs json: JSONValue?) {
        if let s = json?.string { self = [Run(s)]; return }
        self = (json?.array ?? []).compactMap(Run.init(json:))
    }

    public var json: JSONValue { .array(map(\.json)) }
}

/// A block of a block this build does not know, kept whole, drawn as its text.
public struct UnknownBlock: Equatable, Sendable {
    public var kind: String
    public var text: String
    public var raw: JSONValue

    public init(_ raw: JSONValue) {
        self.raw = raw
        kind = raw["k"]?.string ?? ""
        if let t = raw["text"]?.string {
            text = t
        } else {
            text = raw.strings(skippingKeys: ["k"]).joined(separator: " ")
        }
    }
}

/// An item of a list.
public struct ListItem: Equatable, Sendable {
    public var runs: Inline
    /// Indented two spaces or more under the item before it (bullet lists only).
    public var sub: Bool

    public init(_ runs: Inline, sub: Bool = false) {
        self.runs = runs
        self.sub = sub
    }

    init(json: JSONValue) {
        runs = Inline(runs: json["r"] ?? json["text"])
        sub = json["sub"]?.bool ?? false
    }

    var json: JSONValue {
        var o: [String: JSONValue] = ["r": runs.json]
        if sub { o["sub"] = true }
        return .object(o)
    }
}

/// A markdown block (md() in the page).
public enum MarkdownBlock: Equatable, Sendable {
    case paragraph(Inline)
    case bullets([ListItem])
    case numbered(start: Int, items: [ListItem])
    case heading(Inline)
    case rule
    /// Rows of cells; the first row heads the table.
    case table([[Inline]])
    case unknown(UnknownBlock)

    public init(json: JSONValue) {
        guard json.object != nil else {
            self = .unknown(UnknownBlock(json))
            return
        }
        switch json["k"]?.string {
        case "p": self = .paragraph(Inline(runs: json["r"]))
        case "h": self = .heading(Inline(runs: json["r"]))
        case "hr": self = .rule
        case "ul": self = .bullets((json["items"]?.array ?? []).map(ListItem.init(json:)))
        case "ol":
            self = .numbered(start: json["start"]?.int ?? 1, items: (json["items"]?.array ?? []).map(ListItem.init(json:)))
        case "table":
            self = .table((json["rows"]?.array ?? []).map { row in (row.array ?? []).map { Inline(runs: $0) } })
        default:
            self = .unknown(UnknownBlock(json))
        }
    }

    public var json: JSONValue {
        switch self {
        case .paragraph(let r): return ["k": "p", "r": r.json]
        case .heading(let r): return ["k": "h", "r": r.json]
        case .rule: return ["k": "hr"]
        case .bullets(let items): return ["k": "ul", "items": .array(items.map(\.json))]
        case .numbered(let start, let items): return ["k": "ol", "start": .number(Double(start)), "items": .array(items.map(\.json))]
        case .table(let rows): return ["k": "table", "rows": .array(rows.map { .array($0.map(\.json)) })]
        case .unknown(let u): return u.raw
        }
    }

    /// The block's text without styles (VoiceOver, logs).
    public var plainText: String {
        switch self {
        case .paragraph(let r), .heading(let r): return r.plainText
        case .rule: return ""
        case .bullets(let items), .numbered(_, let items): return items.map(\.runs.plainText).joined(separator: "\n")
        case .table(let rows): return rows.map { $0.map(\.plainText).joined(separator: " | ") }.joined(separator: "\n")
        case .unknown(let u): return u.text
        }
    }
}

/// How a metric's change reads: good (the earned ink), warn (orange) or plain (muted).
public enum MetricTone: String, Equatable, Sendable {
    case good, warn, plain
}

/// A metric card row: LABEL, value, ref and delta.
public struct MetricRow: Equatable, Sendable {
    public var label: String
    public var value: String
    public var ref: String
    public var delta: String
    public var tone: MetricTone

    public init(label: String, value: String, ref: String = "", delta: String = "", tone: MetricTone = .plain) {
        self.label = label
        self.value = value
        self.ref = ref
        self.delta = delta
        self.tone = tone
    }

    init(json: JSONValue) {
        label = json["label"]?.string ?? ""
        value = json["value"]?.string ?? ""
        ref = json["ref"]?.string ?? ""
        delta = json["delta"]?.string ?? ""
        tone = MetricTone(rawValue: (json["tone"]?.string ?? "").lowercased()) ?? .plain
    }

    var json: JSONValue {
        ["label": .string(label), "value": .string(value), "ref": .string(ref), "delta": .string(delta), "tone": .string(tone.rawValue)]
    }
}

/// A part of a %% reply.
public enum CoachSection: Equatable, Sendable {
    case markdown([MarkdownBlock])
    case metrics([MetricRow])
    case takeaway(Inline)
    case unknown(UnknownBlock)

    public init(json: JSONValue) {
        switch json["k"]?.string {
        case "md": self = .markdown((json["blocks"]?.array ?? []).map(MarkdownBlock.init(json:)))
        case "metrics": self = .metrics((json["rows"]?.array ?? []).map(MetricRow.init(json:)))
        case "take": self = .takeaway(Inline(runs: json["r"] ?? json["text"]))
        default: self = .unknown(UnknownBlock(json))
        }
    }

    public var json: JSONValue {
        switch self {
        case .markdown(let b): return ["k": "md", "blocks": .array(b.map(\.json))]
        case .metrics(let rows): return ["k": "metrics", "rows": .array(rows.map(\.json))]
        case .takeaway(let r): return ["k": "take", "r": r.json]
        case .unknown(let u): return u.raw
        }
    }
}

/// An action chip under a %% reply: tapping it sends `msg` (`coach.action {id, text}`).
public struct CoachAction: Equatable, Sendable {
    public var label: String
    public var msg: String
    /// The first chip: the room's action colour and an arrow after the label.
    public var primary: Bool

    public init(label: String, msg: String, primary: Bool) {
        self.label = label
        self.msg = msg
        self.primary = primary
    }

    /// Nil without a label (the page never sends one; a chip with no words cannot be drawn).
    init?(json: JSONValue, index: Int) {
        guard let label = json["label"]?.string, !label.isEmpty else { return nil }
        self.label = label
        let msg = json["msg"]?.string ?? ""
        self.msg = msg.isEmpty ? label : msg
        primary = json["primary"]?.bool ?? (index == 0)
    }

    var json: JSONValue { ["label": .string(label), "msg": .string(msg), "primary": .bool(primary)] }
}

/// A message's body.
public enum MessageBody: Equatable, Sendable {
    /// The owner's words or the app's own note, shown as written.
    case text(String)
    /// A prose reply.
    case markdown([MarkdownBlock])
    /// A %% reply: markdown runs, metric cards, the takeaway, and its chips.
    case coach(sections: [CoachSection], actions: [CoachAction])
    /// A body kind this build does not know, drawn as its text.
    case unknown(UnknownBlock)

    public init(json: JSONValue?) {
        guard let json, !json.isNull else { self = .text(""); return }
        if let s = json.string { self = .text(s); return }
        guard json.object != nil else { self = .unknown(UnknownBlock(json)); return }
        switch json["k"]?.string {
        case "md":
            self = .markdown((json["blocks"]?.array ?? []).map(MarkdownBlock.init(json:)))
        case "cmb":
            let actions = (json["actions"]?.array ?? []).enumerated().compactMap { CoachAction(json: $0.element, index: $0.offset) }
            self = .coach(sections: (json["sections"]?.array ?? []).map(CoachSection.init(json:)), actions: Array(actions.prefix(2)))
        case "text":
            self = .text(json["text"]?.string ?? "")
        default:
            self = .unknown(UnknownBlock(json))
        }
    }

    /// The canonical JSON (what decoding read, less anything it ignored).
    public var json: JSONValue {
        switch self {
        case .text(let s): return .string(s)
        case .markdown(let b): return ["k": "md", "blocks": .array(b.map(\.json))]
        case .coach(let sections, let actions):
            return ["k": "cmb", "sections": .array(sections.map(\.json)), "actions": .array(actions.map(\.json))]
        case .unknown(let u): return u.raw
        }
    }

    /// The chips to show (only a %% reply has them).
    public var actions: [CoachAction] {
        if case .coach(_, let a) = self { return a }
        return []
    }

    /// The body's text without styles, blocks on their own lines (VoiceOver, logs, the composer's
    /// empty-state preview).
    public var plainText: String {
        switch self {
        case .text(let s): return s
        case .markdown(let blocks): return blocks.map(\.plainText).filter { !$0.isEmpty }.joined(separator: "\n")
        case .coach(let sections, _):
            return sections.map { s -> String in
                switch s {
                case .markdown(let b): return b.map(\.plainText).filter { !$0.isEmpty }.joined(separator: "\n")
                case .metrics(let rows):
                    return rows.map { r in [r.label + ":", r.value, r.ref, r.delta].filter { !$0.isEmpty }.joined(separator: " ") }.joined(separator: "\n")
                case .takeaway(let r): return r.plainText
                case .unknown(let u): return u.text
                }
            }.filter { !$0.isEmpty }.joined(separator: "\n")
        case .unknown(let u): return u.text
        }
    }

    /// The structure as lines, in the format Tools/blocks-fixtures.js reads off the page's HTML:
    /// "md", "p:…", "ul", "li:…", "li.sub:…", "ol:3", "h:…", "hr", "table", "th:a | b", "tr:a | b",
    /// "metrics", "m:LABEL=value|ref|delta#tone", "take:…", "chip*:label>msg", "chip:label>msg";
    /// styled text as {b:…}, {i:…}, {c:…} (letters combined, in that order). A message's eyebrow line
    /// comes before these.
    public var signature: [String] {
        func runs(_ r: Inline) -> String {
            r.merged.map { $0.isPlain ? $0.text : "{\($0.styles):\($0.text)}" }.joined()
        }
        func blocks(_ list: [MarkdownBlock]) -> [String] {
            list.flatMap { b -> [String] in
                switch b {
                case .paragraph(let r): return ["p:" + runs(r)]
                case .heading(let r): return ["h:" + runs(r)]
                case .rule: return ["hr"]
                case .bullets(let items): return ["ul"] + items.map { ($0.sub ? "li.sub:" : "li:") + runs($0.runs) }
                case .numbered(let start, let items): return ["ol:\(start)"] + items.map { "li:" + runs($0.runs) }
                case .table(let rows):
                    return ["table"] + rows.enumerated().map { ($0.offset == 0 ? "th:" : "tr:") + $0.element.map(runs).joined(separator: " | ") }
                case .unknown(let u): return ["?" + u.kind + ":" + u.text]
                }
            }
        }
        switch self {
        case .text(let s): return ["text:" + s]
        case .markdown(let b): return ["md"] + blocks(b)
        case .coach(let sections, let actions):
            var out: [String] = []
            for s in sections {
                switch s {
                case .markdown(let b): out += ["md"] + blocks(b)
                case .metrics(let rows):
                    out.append("metrics")
                    out += rows.map { "m:\($0.label)=\($0.value)|\($0.ref)|\($0.delta)#\($0.delta.isEmpty ? "-" : $0.tone.rawValue)" }
                case .takeaway(let r): out.append("take:" + runs(r))
                case .unknown(let u): out.append("?" + u.kind + ":" + u.text)
                }
            }
            out += actions.map { ($0.primary ? "chip*:" : "chip:") + $0.label + ">" + $0.msg }
            return out
        case .unknown(let u): return ["?" + u.kind + ":" + u.text]
        }
    }
}
