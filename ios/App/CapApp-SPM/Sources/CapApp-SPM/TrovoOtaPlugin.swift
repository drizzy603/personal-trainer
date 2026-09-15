import Foundation
import Capacitor
import os.log

private let otaLog = Logger(subsystem: "app.kt.trainer", category: "ota")

// Live-page updates without localStorage. The web layer downloads a newer
// index.html from GitHub Pages and hands it here; we keep a full copy of the
// bundled web folder (fonts, manifest, bridge files) in Application Support
// and overwrite index.html + build.txt in it. SuperoViewController serves
// that folder on the next launch when its build is newer than the bundle's.
// A launch that never reaches confirm() trips the breaker: the next launch
// serves the bundle again and the staged copy is deleted.
public enum TrovoOta {
    static let liveBuildKey = "otaLiveBuild"      // stamp of the staged page
    static let attemptKey   = "otaAttempt"        // stamp being served, unconfirmed
    static let sourceKey    = "otaSourceBundle"   // bundle build the live dir was cloned from

    public static var liveDir: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("supero-live", isDirectory: true)
    }

    public static var bundleBuild: String {
        if let url = Bundle.main.url(forResource: "build", withExtension: "txt", subdirectory: "public"),
           let s = try? String(contentsOf: url, encoding: .utf8) {
            return s.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        // Older bundles: parse the meta tag.
        if let url = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "public"),
           let s = try? String(contentsOf: url, encoding: .utf8),
           let r = s.range(of: "<meta name=\"build\" content=\"") {
            let tail = s[r.upperBound...]
            if let end = tail.firstIndex(of: "\"") { return String(tail[..<end]) }
        }
        return ""
    }

    // "YYYYMMDD-N" ordering, same rule as the web layer's buildNewer().
    public static func newer(_ a: String, than b: String) -> Bool {
        func parts(_ s: String) -> (Int, Int) {
            let p = s.split(separator: "-")
            return (Int(p.first ?? "") ?? 0, p.count > 1 ? (Int(p[1]) ?? 0) : 0)
        }
        let x = parts(a), y = parts(b)
        return x.0 != y.0 ? x.0 > y.0 : x.1 > y.1
    }

    public static func wipe() {
        try? FileManager.default.removeItem(at: liveDir)
        let d = UserDefaults.standard
        d.removeObject(forKey: liveBuildKey); d.removeObject(forKey: attemptKey); d.removeObject(forKey: sourceKey)
    }

    // Decide what this launch serves. Returns the live dir or nil for the bundle.
    public static func launchLocation() -> URL? {
        let d = UserDefaults.standard
        let fm = FileManager.default
        let index = liveDir.appendingPathComponent("index.html")
        guard fm.fileExists(atPath: index.path), let live = d.string(forKey: liveBuildKey), !live.isEmpty else { return nil }
        let bundle = bundleBuild
        if !newer(live, than: bundle) {                      // the binary caught up
            otaLog.info("live \(live, privacy: .public) not newer than bundle \(bundle, privacy: .public) → serving bundle, wiping")
            wipe(); return nil
        }
        if d.string(forKey: attemptKey) == live {            // served last time, never confirmed
            otaLog.error("live \(live, privacy: .public) never confirmed → breaker, serving bundle")
            wipe(); return nil
        }
        d.set(live, forKey: attemptKey)
        otaLog.info("serving live \(live, privacy: .public) over bundle \(bundle, privacy: .public)")
        return liveDir
    }
}

@objc(TrovoOtaPlugin)
public class TrovoOtaPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TrovoOtaPlugin"
    public let jsName = "TrovoOta"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "stage",   returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "confirm", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status",  returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reset",   returnType: CAPPluginReturnPromise),
    ]

    @objc func stage(_ call: CAPPluginCall) {
        guard let html = call.getString("html"), let build = call.getString("build"), html.count > 10_000 else {
            call.reject("html + build required"); return
        }
        DispatchQueue.global(qos: .utility).async {
            let fm = FileManager.default
            let d = UserDefaults.standard
            let dir = TrovoOta.liveDir
            let bundle = TrovoOta.bundleBuild
            do {
                // Clone the bundled web folder once per binary so fonts, manifest
                // and the bridge files sit next to the live page.
                if !fm.fileExists(atPath: dir.appendingPathComponent("manifest.json").path) || d.string(forKey: TrovoOta.sourceKey) != bundle {
                    try? fm.removeItem(at: dir)
                    guard let src = Bundle.main.url(forResource: "public", withExtension: nil) else { throw NSError(domain: "ota", code: 1) }
                    try fm.createDirectory(at: dir.deletingLastPathComponent(), withIntermediateDirectories: true)
                    try fm.copyItem(at: src, to: dir)
                    d.set(bundle, forKey: TrovoOta.sourceKey)
                }
                try html.write(to: dir.appendingPathComponent("index.html"), atomically: true, encoding: .utf8)
                try (build + "\n").write(to: dir.appendingPathComponent("build.txt"), atomically: true, encoding: .utf8)
                var values = URLResourceValues(); values.isExcludedFromBackup = true
                var mdir = dir; try? mdir.setResourceValues(values)
                d.set(build, forKey: TrovoOta.liveBuildKey)
                d.removeObject(forKey: TrovoOta.attemptKey)
                otaLog.info("staged live \(build, privacy: .public) (\(html.count) chars)")
                DispatchQueue.main.async { call.resolve(["staged": true, "build": build]) }
            } catch {
                otaLog.error("stage failed: \(error.localizedDescription, privacy: .public)")
                DispatchQueue.main.async { call.reject(error.localizedDescription) }
            }
        }
    }

    // First successful render of a live page disarms the breaker.
    @objc func confirm(_ call: CAPPluginCall) {
        UserDefaults.standard.removeObject(forKey: TrovoOta.attemptKey)
        call.resolve()
    }

    @objc func status(_ call: CAPPluginCall) {
        let d = UserDefaults.standard
        let active = (bridge?.config.appLocation.path ?? "").contains("supero-live")
        call.resolve([
            "bundleBuild": TrovoOta.bundleBuild,
            "liveBuild": d.string(forKey: TrovoOta.liveBuildKey) ?? "",
            "active": active,
        ])
    }

    @objc func reset(_ call: CAPPluginCall) {
        TrovoOta.wipe()
        call.resolve()
    }
}
