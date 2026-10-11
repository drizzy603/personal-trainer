#if os(iOS) && DEBUG
import Foundation
import UIKit
import WebKit
import FPCore
import FPStore

/// The native scenario runner's hands inside the app (Debug builds only; plan task S5, tests/native-store.sh).
///
/// `-fpProbe <steps file>` (a JSON file in `Documents/fp-probe/`, written there by the host) turns it on. The file
/// holds phases, `{"phases": [[step, ...], ...]}`: phase k runs once the k-th page of this process finished booting
/// (StoreAttach's bootDone), so a step that starts a new document (killWebContent, reload, sceneDestroy) ends its
/// phase and the next one runs on the new page. Every event goes to `Documents/fp-probe/<log>` (`-fpProbeLog`,
/// default `probe.jsonl`) as one JSON object per line, before the next step starts, so a SIGKILL step leaves a whole
/// record behind. The host reads that log and the two SQLite files (WebKit's and the store's) and decides; this
/// file only acts and reports.
///
/// Steps: `wait {ms}`, `js {src, args}` (an async function body run in the page world; its JSON result logged),
/// `state {label}` (page reads, WebKit's own values and the store's, hashed, with the facade's counters, the
/// CapacitorHttp patch, any alert on screen and StoreAttach's status), `status`, `conflicts`, `sigkill {afterMs}`,
/// `killWebContent`, `reload`, `hide`, `show`, `race {seconds, checkpoints, snaps}`, `sceneDestroy`,
/// `waitState {state, timeoutMs}` (the app's state: active, inactive or background), `stageOta {build, html}`,
/// `stagePutBack {snap}` (`@wipe`: rule 3's snapshot), `policy {file, json}`, `defaults {keys}`, `done`.
@MainActor
final class StoreProbe {
    static var shared: StoreProbe?

    unowned let attach: StoreAttach
    let dir: URL
    let log: FileHandle?
    let name: String
    private var phases: [[[String: Any]]] = []
    private var nextPhase = 0
    private var running = false
    private var killed = false
    private weak var webView: WKWebView?
    private var hidden: (superview: UIView, index: Int, frame: CGRect)?
    private var sceneRefused = false
    private let t0 = Date()

    static func startIfAsked(attach: StoreAttach, arguments a: [String]) {
        guard shared == nil, let i = a.firstIndex(of: "-fpProbe"), i + 1 < a.count else { return }
        var logName = "probe.jsonl"
        if let j = a.firstIndex(of: "-fpProbeLog"), j + 1 < a.count { logName = a[j + 1] }
        shared = StoreProbe(attach: attach, steps: a[i + 1], logName: logName)
    }

    private init(attach: StoreAttach, steps: String, logName: String) {
        self.attach = attach
        name = steps
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        dir = docs.appendingPathComponent("fp-probe", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let logURL = dir.appendingPathComponent(logName)
        if !FileManager.default.fileExists(atPath: logURL.path) { FileManager.default.createFile(atPath: logURL.path, contents: nil) }
        log = try? FileHandle(forWritingTo: logURL)
        _ = try? log?.seekToEnd()
        if let data = try? Data(contentsOf: dir.appendingPathComponent(steps)),
           let obj = try? JSONSerialization.jsonObject(with: data) {
            if let d = obj as? [String: Any], let p = d["phases"] as? [[[String: Any]]] { phases = p }
            else if let p = obj as? [[String: Any]] { phases = [p] }
        }
        event("probe", ["steps": steps, "phases": phases.count, "pid": Int(getpid()), "args": ProcessInfo.processInfo.arguments])
    }

    // MARK: Log

    func event(_ ev: String, _ fields: [String: Any] = [:]) {
        var o = fields
        o["ev"] = ev
        o["t"] = Int(Date().timeIntervalSince(t0) * 1000)
        o["wall"] = Int64(Date().timeIntervalSince1970 * 1000)
        o["appState"] = UIApplication.shared.applicationState.rawValue
        let clean = Self.jsonSafe(o)
        guard JSONSerialization.isValidJSONObject(clean),
              var data = try? JSONSerialization.data(withJSONObject: clean, options: [.sortedKeys]) else { return }
        data.append(0x0A)
        log?.write(data)
    }

    /// Turns anything into something JSONSerialization takes.
    static func jsonSafe(_ v: Any) -> Any {
        switch v {
        case let d as [String: Any]: return d.mapValues { jsonSafe($0) }
        case let a as [Any]: return a.map { jsonSafe($0) }
        case is NSNull, is String, is Bool, is Int, is Int64, is Double, is NSNumber: return v
        case let date as Date: return Int64(date.timeIntervalSince1970 * 1000)
        default: return String(describing: v)
        }
    }

    // MARK: Hooks from StoreAttach

    func installed(webView: WKWebView, serial: Int, page: String?) {
        self.webView = webView
        event("installed", ["serial": serial, "page": page ?? NSNull(), "alive": attach.pagesAlive])
        armBootFallback()
    }

    func bootDone(webView: WKWebView?, ignoredByBreaker: Bool) {
        event("bootDone", ["document": attach.document.attached, "ignoredByBreaker": ignoredByBreaker,
                           "offWhy": attach.document.offWhy ?? NSNull()])
        if let webView { self.webView = webView }
        bootWait += 1
        startPhase()
    }

    private var bootWait = 0

    /// A page that never confirms its first paint (WebKit unreadable breaks the page's boot) still gets its phase. Long
    /// enough for a slow simulator: a WebContent restart on a loaded iOS 27 simulator took 11 s to its new bootDone.
    private func armBootFallback(seconds: Double = 30) {
        bootWait += 1
        let gen = bootWait, phase = nextPhase
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) {
            MainActor.assumeIsolated {
                guard gen == self.bootWait, !self.running, !self.killed, self.nextPhase == phase else { return }
                self.event("bootDoneTimeout", ["seconds": seconds])
                self.startPhase()
            }
        }
    }

    private func startPhase() {
        guard !running, !killed, nextPhase < phases.count else { return }
        let steps = phases[nextPhase]
        let index = nextPhase
        nextPhase += 1
        running = true
        // Let the page's first render settle (its boot timers, the facade's counters).
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
            MainActor.assumeIsolated {
                self.event("phase", ["index": index, "steps": steps.count])
                self.run(steps, 0)
            }
        }
    }

    // MARK: Steps

    private func run(_ steps: [[String: Any]], _ i: Int) {
        guard i < steps.count else {
            running = false
            if nextPhase >= phases.count { event("done") }
            return
        }
        let step = steps[i]
        let op = step["op"] as? String ?? ""
        let next = { [weak self] in self?.run(steps, i + 1) }
        let endPhase = { [weak self] in
            self?.running = false
            self?.armBootFallback()
        }
        switch op {
        case "wait":
            let ms = (step["ms"] as? NSNumber)?.doubleValue ?? 500
            DispatchQueue.main.asyncAfter(deadline: .now() + ms / 1000) { next() }
        case "js":
            js(step["src"] as? String ?? "return null", args: step["args"] as? [String: Any] ?? [:]) { [weak self] r in
                self?.event("js", ["label": step["label"] ?? NSNull(), "result": r])
                next()
            }
        case "state":
            state(label: step["label"] as? String ?? "") { next() }
        case "status":
            event("status", ["label": step["label"] ?? NSNull(), "status": attach.statusJSON()])
            next()
        case "conflicts":
            let rows = attach.store?.conflicts(limit: 200) ?? []
            event("conflicts", ["rows": rows.map { ["id": $0.id, "key": $0.key, "why": $0.why, "h": $0.h, "hnew": $0.hnew] }])
            next()
        case "sigkill":
            let ms = (step["afterMs"] as? NSNumber)?.doubleValue ?? 0
            killed = true
            event("sigkill", ["afterMs": ms])
            let us = useconds_t(max(0, ms) * 1000)
            Thread.detachNewThread {
                if us > 0 { usleep(us) }
                kill(getpid(), SIGKILL)
            }
        case "killWebContent":
            event("killWebContent")
            webView?.perform(NSSelectorFromString("_killWebContentProcess"))
            endPhase()
        case "reload":
            event("reload")
            webView?.reload()
            endPhase()
        case "hide":
            if let wv = webView, let sup = wv.superview {
                hidden = (sup, sup.subviews.firstIndex(of: wv) ?? sup.subviews.count, wv.frame)
                wv.removeFromSuperview()
                event("hide", ["window": wv.window != nil])
            } else {
                event("hide", ["error": "no superview"])
            }
            next()
        case "show":
            if let wv = webView, let h = hidden {
                h.superview.insertSubview(wv, at: min(h.index, h.superview.subviews.count))
                wv.frame = h.frame
                hidden = nil
                event("show", ["window": wv.window != nil])
            }
            next()
        case "race":
            race(step) { next() }
        case "waitState":
            let want = step["state"] as? String ?? "active"
            let timeout = ((step["timeoutMs"] as? NSNumber)?.doubleValue ?? 30000) / 1000
            waitState(want, deadline: Date().addingTimeInterval(timeout)) { [weak self] ok in
                self?.event("waitState", ["state": want, "ok": ok])
                next()
            }
        case "sceneDestroy":
            // The real request. UIKit refuses it for an app without multiple scenes on an iPhone; then the phase
            // goes on to the next step (sceneCycle), else the scene really goes and the phase ends here.
            guard let scene = webView?.window?.windowScene else {
                event("sceneDestroy", ["error": "no scene"])
                next()
                return
            }
            event("sceneDestroy", ["session": scene.session.persistentIdentifier])
            sceneRefused = false
            UIApplication.shared.requestSceneSessionDestruction(scene.session, options: nil) { [weak self] e in
                let text = "\(e)"
                DispatchQueue.main.async {
                    MainActor.assumeIsolated {
                        self?.sceneRefused = true
                        self?.event("sceneDestroyRefused", ["error": text])
                    }
                }
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                MainActor.assumeIsolated { if self.sceneRefused { next() } else { endPhase() } }
            }
        case "sceneCycle":
            // What a reconnect does inside the process, step by step: the disconnect's call into StoreAttach, the new
            // scene's connection, and a new SuperoViewController from Main.storyboard in the window (UIKit makes one
            // per scene connection), whose web view loads a new page; the old controller and its web view go.
            guard let wv = webView, let window = wv.window,
                  let vc = UIStoryboard(name: "Main", bundle: .main).instantiateInitialViewController() else {
                event("sceneCycle", ["error": "no window or storyboard"])
                next()
                return
            }
            attach.sceneDisconnected(webView: wv)
            attach.sceneConnected()
            event("sceneCycle", ["newController": String(describing: type(of: vc))])
            window.rootViewController = vc
            endPhase()
        case "stageOta":
            let build = step["build"] as? String ?? ""
            let file = dir.appendingPathComponent(step["html"] as? String ?? "ota.html")
            guard let html = try? String(contentsOf: file, encoding: .utf8) else {
                event("stageOta", ["error": "no html at \(file.lastPathComponent)"])
                next()
                return
            }
            js("var r = await window.Capacitor.Plugins.TrovoOta.stage({html: args.html, build: args.build}); return r;",
               args: ["html": html, "build": build]) { [weak self] r in
                self?.event("stageOta", ["build": build, "chars": html.count, "result": r])
                next()
            }
        case "stagePutBack":
            var snap = step["snap"] as? String ?? ""
            if snap == "@wipe" { snap = attach.store?.status().wipeOffer?.snap ?? "" }
            let plan = attach.store?.stagePutBack(snap: snap)
            event("stagePutBack", ["snap": snap, "items": plan?.items.map { "\($0.key):\($0.outcome)" } ?? []])
            next()
        case "defaults":
            let keys = step["keys"] as? [String] ?? []
            var out: [String: Any] = [:]
            for k in keys { out[k] = UserDefaults.standard.object(forKey: k) ?? NSNull() }
            event("defaults", ["values": out])
            next()
        case "policy":
            let file = step["file"] as? String ?? "fp-policy.json"
            let url = URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent(file)
            if let text = step["json"] as? String { try? Data(text.utf8).write(to: url) } else { try? FileManager.default.removeItem(at: url) }
            FPPolicy.shared.fetchIfDue(force: true)
            let p = FPPolicy.shared.effective
            event("policy", ["facade": p.facade.rawValue, "result": FPPolicy.shared.state.lastResult ?? NSNull()])
            next()
        case "done":
            event("done")
            running = false
        default:
            event("unknownStep", ["op": op])
            next()
        }
    }

    private func waitState(_ want: String, deadline: Date, _ done: @escaping (Bool) -> Void) {
        let s: String
        switch UIApplication.shared.applicationState {
        case .active: s = "active"
        case .inactive: s = "inactive"
        default: s = "background"
        }
        if s == want { done(true); return }
        if Date() > deadline { done(false); return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            MainActor.assumeIsolated { self.waitState(want, deadline: deadline, done) }
        }
    }

    /// Runs an async function body in the page world, with the step's arguments as `args`; the result comes back as
    /// JSON (or an error string).
    private func js(_ src: String, args: [String: Any], _ done: @escaping (Any) -> Void) {
        guard let wv = webView else { done(["error": "no web view"]); return }
        let body = "var __r = await (async function () { \(src)\n })(); return JSON.stringify(__r === undefined ? null : __r);"
        wv.callAsyncJavaScript(body, arguments: ["args": args], in: nil, in: .page) { result in
            switch result {
            case .success(let v):
                if let s = v as? String, let data = s.data(using: .utf8),
                   let obj = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]) {
                    done(obj)
                } else {
                    done(v)
                }
            case .failure(let e):
                done(["error": "\(e)"])
            }
        }
    }

    static let stateJS = """
        var H = function (s) { if (s == null) return null; var a = 0x811c9dc5, b = 5381, i, c;
          for (i = 0; i < s.length; i++) { c = s.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193) >>> 0; b = (Math.imul(b, 33) + c) >>> 0; }
          return s.length + ':' + a.toString(16) + ':' + b.toString(16); };
        var pg = {}, wk = {}, real = window.__fpRealLS, P = Storage.prototype, i, n, k;
        try { for (i = 0, n = localStorage.length; i < n; i++) { k = localStorage.key(i); pg[k] = H(localStorage.getItem(k)); } }
        catch (e) { pg = { __error: String(e) }; }
        try { if (real) for (i = 0, n = real.length; i < n; i++) { k = P.key.call(real, i); wk[k] = H(P.getItem.call(real, k)); } }
        catch (e) { wk = { __error: String(e) }; }
        var st = window.__ktStoreState, s = null;
        if (st) { s = {}; Object.keys(st).forEach(function (key) { if (typeof st[key] !== 'function') s[key] = st[key]; }); }
        var scr = document.getElementById('screen'), routine = null, sessions = -1, tab = null;
        try { routine = (typeof hasCustomRoutine === 'function') ? hasCustomRoutine() : null; } catch (e) { routine = 'error'; }
        try { sessions = (typeof getSessions === 'function') ? getSessions().length : -1; } catch (e) { sessions = 'error'; }
        try { tab = (typeof currentTab !== 'undefined') ? currentTab : null; } catch (e) {}
        // Capacitor keeps the browser's fetch as CapacitorWebFetch and, when the CapacitorHttp check (its synchronous
        // prompt, which KTUIProxy forwards) answers true, puts its own fetch in its place. -fpOffline's wrapper sits
        // on top, so it keeps the fetch it found as __fpCapFetch.
        var cf = window.__fpCapFetch || window.fetch;
        return { page: pg, webkit: wk, st: s, flag: typeof window.__ktStore, wkMs: window.__fpWkMs,
          capHttp: typeof window.CapacitorWebFetch === 'function' && cf !== window.CapacitorWebFetch,
          rendered: !!(scr && scr.firstElementChild), vis: document.visibilityState,
          routine: routine, sessions: sessions, tab: tab };
        """

    private func state(label: String, _ done: @escaping () -> Void) {
        js(Self.stateJS, args: [:]) { [weak self] r in
            guard let self else { return }
            let alert = UIApplication.shared.connectedScenes
                .compactMap { ($0 as? UIWindowScene)?.windows }.flatMap { $0 }
                .contains { $0.rootViewController?.presentedViewController is UIAlertController }
            self.event("state", ["label": label, "js": r, "store": self.attach.storeHashes(), "alert": alert,
                                 "status": self.attach.statusJSON()])
            done()
        }
    }

    /// Page writes every 2 ms while checkpoints and snapshots run on another thread, then the facade's counters.
    private func race(_ step: [String: Any], _ done: @escaping () -> Void) {
        let seconds = (step["seconds"] as? NSNumber)?.doubleValue ?? 3
        let checkpoints = (step["checkpoints"] as? NSNumber)?.intValue ?? 20
        let snapCount = (step["snaps"] as? NSNumber)?.intValue ?? 10
        let start = """
            var st = window.__ktStoreState || {}; window.__fpRace = { n: 0, f0: st.fallbacks || 0, w0: st.writes || 0 };
            window.__fpRace.id = setInterval(function () {
              for (var j = 0; j < 4; j++) { var n = window.__fpRace.n++;
                localStorage.setItem('kt_probe_race_' + (n % 40), 'race ' + n + ' ' + new Array(64).join('xy')); }
            }, 2);
            return true;
            """
        js(start, args: [:]) { [weak self] _ in
            guard let self, let store = self.attach.store else { done(); return }
            let total = max(checkpoints, snapCount)
            let gap = seconds / Double(max(total, 1) + 1)
            DispatchQueue.global(qos: .userInitiated).async {
                var cp = 0, cpFail = 0, sn = 0, snFail = 0
                var maxCp = 0.0, maxSn = 0.0
                for k in 0..<total {
                    usleep(useconds_t(gap * 1_000_000))
                    if k < checkpoints {
                        let t = DispatchTime.now().uptimeNanoseconds
                        if store.checkpoint() { cp += 1 } else { cpFail += 1 }
                        maxCp = max(maxCp, Double(DispatchTime.now().uptimeNanoseconds &- t) / 1e6)
                    }
                    if k < snapCount {
                        let t = DispatchTime.now().uptimeNanoseconds
                        if (try? store.writeSnap(kind: "manual")) != nil { sn += 1 } else { snFail += 1 }
                        maxSn = max(maxSn, Double(DispatchTime.now().uptimeNanoseconds &- t) / 1e6)
                    }
                }
                usleep(useconds_t(gap * 1_000_000))
                let native: [String: Any] = ["checkpoints": cp, "checkpointFailures": cpFail, "snaps": sn, "snapFailures": snFail,
                                             "maxCheckpointMs": maxCp, "maxSnapMs": maxSn]
                DispatchQueue.main.async {
                    MainActor.assumeIsolated {
                        let stop = """
                            clearInterval(window.__fpRace.id); var st = window.__ktStoreState || {};
                            return { writes: window.__fpRace.n, mirrored: (st.writes || 0) - window.__fpRace.w0,
                                     fallbacks: (st.fallbacks || 0) - window.__fpRace.f0, full: st.full, busy: st.busy,
                                     err: st.err, none: st.none, maxMs: st.maxMs };
                            """
                        self.js(stop, args: [:]) { r in
                            self.event("race", ["page": r, "native": native])
                            done()
                        }
                    }
                }
            }
        }
    }
}
#endif
