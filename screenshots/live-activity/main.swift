import SwiftUI
#if canImport(AppKit)
import AppKit
#endif
import CoreText
import ImageIO
import UniformTypeIdentifiers

// Mockups of the rest Live Activity (ios/App/TrovoTimerWidget/TrovoRestViews.swift), drawn by
// SwiftUI with the widget's own fonts: the Lock Screen card on a wallpaper like the owner's at
// 402 pt (their phone) and 361 pt, light and dark; the Dynamic Island compact, minimal and expanded;
// both rooms; mid-rest, a long name at 10:00, no next-set detail, the done render, no theme.
// render.sh draws them on the Mac; render-ios.sh runs this inside the iOS simulator so iOS's own
// SwiftUI draws them (system progress bar and gauge). Usage: render <fontsDir> <outDir>

let args = CommandLine.arguments
let fontsDir = args.count > 1 ? args[1] : "fonts"
let outDir = args.count > 2 ? args[2] : "out"
try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)

for f in (try? FileManager.default.contentsOfDirectory(atPath: fontsDir)) ?? [] where f.hasSuffix(".ttf") || f.hasSuffix(".otf") {
    var err: Unmanaged<CFError>?
    if !CTFontManagerRegisterFontsForURL(URL(fileURLWithPath: fontsDir + "/" + f) as CFURL, .process, &err) {
        FileHandle.standardError.write("font failed: \(f)\n".data(using: .utf8)!)
    }
}

let now = Date()
struct Scenario { let key: String; let label: String; let m: RestModel }
let scenarios: [Scenario] = [
    Scenario(key: "running", label: "Mid-rest · 0:59 of 1:30, next set known",
             m: RestModel(exerciseName: "Tricep Pushdown", nextSet: 2, totalSets: 3, detail: "77.5 lb × 10",
                          start: now.addingTimeInterval(-31), end: now.addingTimeInterval(59))),
    Scenario(key: "long", label: "Long name, superset partner, 10:00 just started",
             m: RestModel(exerciseName: "Single-Arm Dumbbell Romanian Deadlift", nextSet: 4, totalSets: 5,
                          detail: "Overhead Press · 100 lb × 8", start: now, end: now.addingTimeInterval(600))),
    Scenario(key: "nodetail", label: "No next-set detail (older page) · 1:26 of 1:30",
             m: RestModel(exerciseName: "Barbell Curl (21s)", nextSet: 3, totalSets: 3, detail: nil,
                          start: now.addingTimeInterval(-4), end: now.addingTimeInterval(86))),
    Scenario(key: "done", label: "Rest over (stale render after the end)",
             m: RestModel(exerciseName: "Bench Press", nextSet: 2, totalSets: 4, detail: "160 lb × 8",
                          start: now.addingTimeInterval(-93), end: now.addingTimeInterval(-3))),
]

// A Lock Screen-ish wallpaper close to the owner's (warm brown into purple), plus a pale and a dark one.
struct Wallpaper: View {
    let kind: String
    var body: some View {
        ZStack {
            switch kind {
            case "light":
                LinearGradient(colors: [Color(hex: "#e9e4da")!, Color(hex: "#c9d3df")!], startPoint: .top, endPoint: .bottom)
                Circle().fill(Color(hex: "#f3d9b8")!).frame(width: 220).blur(radius: 50).offset(x: -120, y: 10)
            case "dark":
                LinearGradient(colors: [Color(hex: "#15161a")!, Color(hex: "#25222b")!], startPoint: .top, endPoint: .bottom)
            default:
                LinearGradient(colors: [Color(hex: "#8d6b60")!, Color(hex: "#6c4f70")!], startPoint: .top, endPoint: .bottom)
                Circle().fill(Color(hex: "#5b3a8c")!).frame(width: 260).blur(radius: 60).offset(x: 140, y: 20)
                Circle().fill(Color(hex: "#a07a62")!).frame(width: 200).blur(radius: 50).offset(x: -130, y: -30)
            }
        }
    }
}

let screenW: CGFloat = 430       // the owner's phone (Pro Max)
let cardW: CGFloat = 402         // its Lock Screen Live Activity width
let maxLockH: CGFloat = 160      // ActivityKit's Lock Screen height cap

// The card takes the content's own height, like iOS does, up to the 160 pt cap; taller
// content is clipped there and flagged in red.
struct LockCard: View {
    let m: RestModel; let p: RestPalette; let width: CGFloat
    var body: some View {
        RestLockScreen(m: m, p: p)
            .fixedSize(horizontal: false, vertical: true)
            .frame(width: width)
            .overlay(GeometryReader { g in
                if g.size.height > maxLockH {
                    Text("TOO TALL: \(Int(g.size.height)) pt > 160").font(.system(size: 12, weight: .black)).foregroundColor(.white)
                        .padding(4).background(Color.red).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                }
            })
            .frame(maxHeight: maxLockH, alignment: .top)
            .background(p.lockBackground)
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

struct LockRow: View {
    let s: Scenario; let p: RestPalette; let wall: String; let width: CGFloat
    var body: some View {
        LockCard(m: s.m, p: p, width: width)
            .padding(.vertical, 22)
            .frame(width: screenW)
            .background(Wallpaper(kind: wall))
            .clipped()
            .fixedSize(horizontal: false, vertical: true)
    }
}

struct Compact: View {
    let m: RestModel; let p: RestPalette
    var body: some View {
        HStack(spacing: 0) {
            RestCompactLeading(m: m, p: p).padding(.leading, 14)
            Color.clear.frame(width: 126, height: 1)   // the camera hardware
            RestCompactTrailing(m: m, p: p).padding(.trailing, 14)
        }
        .frame(height: 37)
        .background(Capsule().fill(Color.black))
        .overlay(Capsule().stroke(p.keyline.opacity(0.45), lineWidth: 1.2))
        .fixedSize()
    }
}

struct Minimal: View {
    let m: RestModel; let p: RestPalette
    var body: some View {
        RestMinimal(m: m, p: p)
            .frame(width: 37, height: 37)
            .background(Circle().fill(Color.black))
            .overlay(Circle().stroke(p.keyline.opacity(0.45), lineWidth: 1.2))
    }
}

struct Expanded: View {
    let m: RestModel; let p: RestPalette
    var body: some View {
        VStack(spacing: 8) {
            HStack(alignment: .top, spacing: 0) {
                RestExpandedLeading(m: m, p: p).frame(maxWidth: .infinity, alignment: .leading)
                Color.clear.frame(width: 126, height: 34)
                RestExpandedTrailing(m: m, p: p).frame(maxWidth: .infinity, alignment: .trailing)
            }
            RestExpandedCenter(m: m, p: p).frame(maxWidth: .infinity)
            RestExpandedBottom(m: m, p: p).frame(maxWidth: .infinity)
        }
        .padding(.horizontal, 22).padding(.top, 14).padding(.bottom, 18)
        .frame(width: screenW - 22)
        .frame(maxHeight: 160, alignment: .top)
        .background(RoundedRectangle(cornerRadius: 46, style: .continuous).fill(Color.black))
        .overlay(alignment: .top) {
            Capsule().fill(Color(white: 0.09)).frame(width: 120, height: 34).padding(.top, 6)
        }
        .clipShape(RoundedRectangle(cornerRadius: 46, style: .continuous))
    }
}

struct IslandRow: View {
    let m: RestModel; let p: RestPalette; let bright: Bool
    var body: some View {
        HStack(spacing: 14) {
            Compact(m: m, p: p)
            Minimal(m: m, p: p)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20).padding(.vertical, 12)
        .frame(width: screenW, alignment: .leading)
        .background(bright ? Color(hex: "#f2f2f2")! : Color(hex: "#0c0c0c")!)
    }
}

struct Caption: View {
    let t: String
    var body: some View {
        Text(t).font(.system(size: 11, weight: .semibold)).foregroundColor(Color(white: 0.35))
            .frame(width: screenW, alignment: .leading).padding(.horizontal, 14).padding(.top, 10).padding(.bottom, 4)
            .background(Color.white)
    }
}

struct Sheet: View {
    let name: String; let theme: TimerTheme
    var body: some View {
        let p = RestPalette.of(theme)
        VStack(spacing: 0) {
            Text("\(name) room").font(.system(size: 16, weight: .bold)).frame(width: screenW, alignment: .leading)
                .padding(14).background(Color.white)
            ForEach(scenarios, id: \.key) { s in
                Caption(t: "LOCK SCREEN · \(s.label)")
                LockRow(s: s, p: p, wall: "warm", width: cardW)
            }
            Caption(t: "LOCK SCREEN · smaller phone (361 pt) · long name, on a light and a dark wallpaper")
            LockRow(s: scenarios[1], p: p, wall: "light", width: 361)
            LockRow(s: scenarios[0], p: p, wall: "dark", width: 361)
            Caption(t: "LOCK SCREEN · Display Zoom on a small phone (300 pt)")
            LockRow(s: scenarios[0], p: p, wall: "warm", width: 300)
            LockRow(s: scenarios[1], p: p, wall: "warm", width: 300)
            Caption(t: "DYNAMIC ISLAND · compact + minimal (dark and light status bar)")
            IslandRow(m: scenarios[0].m, p: p, bright: false)
            IslandRow(m: scenarios[1].m, p: p, bright: true)
            IslandRow(m: scenarios[3].m, p: p, bright: false)
            Caption(t: "DYNAMIC ISLAND · expanded (long press)")
            ForEach(Array([0, 1, 3].enumerated()), id: \.offset) { _, i in
                Expanded(m: scenarios[i].m, p: p).padding(.vertical, 8).frame(width: screenW).background(Color(hex: "#0c0c0c")!)
            }
        }
        .background(Color.white)
        .fixedSize()
    }
}

@MainActor func write<V: View>(_ v: V, _ name: String) {
    let r = ImageRenderer(content: v)
    r.scale = 3
    guard let cg = r.cgImage else { print("render failed: \(name)"); return }
    let url = URL(fileURLWithPath: outDir + "/" + name) as CFURL
    guard let dest = CGImageDestinationCreateWithURL(url, UTType.png.identifier as CFString, 1, nil) else { return }
    CGImageDestinationAddImage(dest, cg, nil)
    CGImageDestinationFinalize(dest)
    print("wrote \(outDir)/\(name) \(cg.width)x\(cg.height)")
}

MainActor.assumeIsolated {
    for (name, t) in [("Heavyweight", Rooms.heavyweight), ("Lime", Rooms.lime)] {
        write(Sheet(name: name, theme: t), "sheet-\(name.lowercased()).png")
        let p = RestPalette.of(t)
        for s in scenarios {
            write(LockRow(s: s, p: p, wall: "warm", width: cardW), "lock-\(name.lowercased())-\(s.key).png")
        }
        write(VStack(spacing: 0) { LockRow(s: scenarios[0], p: p, wall: "warm", width: 300); LockRow(s: scenarios[1], p: p, wall: "warm", width: 300) },
              "lock-\(name.lowercased())-narrow.png")
        write(VStack(spacing: 0) { IslandRow(m: scenarios[0].m, p: p, bright: false); Expanded(m: scenarios[0].m, p: p).padding(8).background(Color(hex: "#0c0c0c")!) }, "island-\(name.lowercased()).png")
    }
    // Fallback check: a page that sends no theme
    write(LockRow(s: scenarios[0], p: RestPalette.of(nil), wall: "warm", width: cardW), "lock-notheme-running.png")
}
