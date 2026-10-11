import Foundation
import JavaScriptCore
import XCTest
@testable import FPStore

/// The shipped facade (`Resources/ktstore.js`, through `KTFacade`) run by JavaScriptCore against the real KTStore:
/// what the shell does on the device, less WebKit. A WebKit-like Storage lives in JavaScript; `prompt()` is answered
/// by `KTStore.answer(head:payload:)`, the `ktStore` handler queues posts for `KTStore.post(head:payload:)`. A
/// document is one JSContext over WebKit's content and the same store, so a relaunch is a new Document.
final class FacadeTests: XCTestCase {
    /// WebKit's Storage, the prompt and the post handler, before the shell's two scripts.
    static let environment = """
        var window = this;
        window.top = window;
        function Storage() {}
        Storage.prototype.getItem = function (k) { k = String(k); return Object.prototype.hasOwnProperty.call(this.d, k) ? this.d[k] : null; };
        Storage.prototype.setItem = function (k, v) { if (arguments.length < 2) throw new TypeError('2 arguments required'); this.d[String(k)] = String(v); };
        Storage.prototype.removeItem = function (k) { delete this.d[String(k)]; };
        Storage.prototype.clear = function () { this.d = {}; };
        Storage.prototype.key = function (i) { var ks = Object.keys(this.d); return i >= 0 && i < ks.length ? ks[i] : null; };
        Object.defineProperty(Storage.prototype, 'length', { get: function () { return Object.keys(this.d).length; } });
        var __real = new Storage();
        __real.d = JSON.parse(__wkInit);
        Object.defineProperty(window, 'localStorage', { configurable: true, enumerable: true, get: function () { return __real; } });
        window.prompt = function (msg, def) { return __prompt(String(msg), def === undefined || def === null ? null : String(def)); };
        window.webkit = { messageHandlers: { ktStore: { postMessage: function (b) { __post(String(b.head), b.payload == null ? null : String(b.payload)); } } } };
        function __wk() { return JSON.stringify(__real.d); }
        """

    final class Document {
        let ctx = JSContext()!
        var prompts: [(head: String, payload: String?)] = []
        var posts: [(head: String, payload: String?)] = []
        /// A head (and its payload) answered here instead of by the store; nil = no answer at all.
        var intercept: ((String, String?) -> String??)?

        /// `webkit`: WebKit's content as JSON text (`{}` for an empty WebKit).
        init(webkit: String, store: KTStore, flag: Bool = true, intercept: ((String, String?) -> String??)? = nil) {
            self.intercept = intercept
            ctx.exceptionHandler = { _, e in XCTFail("JavaScript: \(e?.toString() ?? "?")") }
            ctx.setObject(webkit, forKeyedSubscript: "__wkInit" as NSString)
            let prompt: @convention(block) (String, JSValue) -> JSValue = { [unowned self] msg, def in
                let ctx = JSContext.current()!
                guard msg.hasPrefix(KTProtocol.promptPrefix) else { return JSValue(nullIn: ctx) }
                let head = String(msg.dropFirst(KTProtocol.promptPrefix.count))
                let payload: String? = def.isNull || def.isUndefined ? nil : def.toString()
                self.prompts.append((head, payload))
                let answer: String?
                if let i = self.intercept?(head, payload) { answer = i } else { answer = store.answer(head: head, payload: payload) }
                return answer.map { JSValue(object: $0, in: ctx) } ?? JSValue(nullIn: ctx)
            }
            let post: @convention(block) (String, JSValue) -> Void = { [unowned self] head, payload in
                self.posts.append((head, payload.isNull || payload.isUndefined ? nil : payload.toString()))
            }
            ctx.setObject(prompt, forKeyedSubscript: "__prompt" as NSString)
            ctx.setObject(post, forKeyedSubscript: "__post" as NSString)
            ctx.evaluateScript(FacadeTests.environment)
            if flag { ctx.evaluateScript(KTFacade.flagScript(shell: "60")) }
            ctx.evaluateScript(KTFacade.source()!)
        }

        @discardableResult
        func js(_ script: String) -> JSValue { ctx.evaluateScript(script) }

        /// WebKit's content as JSON text, for the next document.
        var webkitJSON: String { js("__wk()").toString() }

        /// WebKit's value of a key in exact code units (through a JSON literal, so a lone surrogate survives).
        func webkit(_ key: KTKey) -> U16? {
            let lit = js("JSON.stringify(__real.getItem(\(KTWire.quote(key))))").toString() ?? "null"
            return lit == "null" ? nil : KTWire.unquote(Array(lit.utf16))
        }

        /// Every key WebKit holds, exact.
        var webkitAll: [KTKey: U16] {
            let text = Array(webkitJSON.utf16)
            var out: [KTKey: U16] = [:]
            for (k, r) in KTJSON.objectMembers(text) ?? [] {
                if let key = KTKey(units: k), let v = KTJSON.string(text, r) { out[key] = v }
            }
            return out
        }

        func state(_ field: String) -> JSValue { js("window.__ktStoreState ? window.__ktStoreState.\(field) : undefined") }

        func deliver(to store: KTStore) -> [KTPostResult] {
            defer { posts.removeAll() }
            return posts.map { store.post(head: $0.head, payload: $0.payload) }
        }
    }

    /// WebKit's content as the JSON text the environment parses (every surrogate half escaped).
    static func json(_ values: [KTKey: U16]) -> String {
        "{" + values.keys.sorted().map { KTWire.quote($0) + ":" + KTWire.quote(values[$0]!) }.joined(separator: ",") + "}"
    }

    func pageView(_ doc: Document) -> [KTKey: U16] { doc.webkitAll.filter { !KTProtocol.isReserved($0.key) } }

    func openStore(_ temp: TempDir, clock: TestClock = TestClock()) -> KTStore {
        let store = KTStore.open(storeConfig(temp.store, clock: clock))
        XCTAssertEqual(store.state, .ready)
        return store
    }

    // MARK: The resource

    func testTheFacadeShipsAsAnFPStoreResource() throws {
        let src = try XCTUnwrap(KTFacade.source(), "Resources/ktstore.js is in FPStore's bundle")
        XCTAssertTrue(src.unicodeScalars.allSatisfy { $0.isASCII }, "pure ASCII")
        XCTAssertTrue(src.contains("'\\u0001KT1 '"), "the KT1 prompt prefix")
        XCTAssertTrue(src.contains("'kt__store_gap'"), "the gap note's key")
        XCTAssertTrue(src.contains("cfg.proto !== 1"), "the flag check")
        XCTAssertEqual(KTFacade.flagScript(shell: "60"), #"window.__ktStore = {"proto":1,"shell":"60"};"#)
        XCTAssertEqual(KTFacade.flagScript(shell: "6\u{2028}0"), "window.__ktStore = {\"proto\":1,\"shell\":\"6" + "\\" + "u20280\"};")
    }

    func testWithoutTheFlagTheFacadeNeverPrompts() {
        let temp = TempDir()
        let store = openStore(temp)
        let doc = Document(webkit: #"{"kt_theme":"dark"}"#, store: store, flag: false)
        doc.js("localStorage.setItem('kt_theme', 'light'); localStorage.removeItem('kt_week')")
        XCTAssertTrue(doc.prompts.isEmpty)
        XCTAssertEqual(doc.js("typeof window.__ktStoreState").toString(), "undefined")
        XCTAssertTrue(doc.js("localStorage === __real").toBool(), "the page keeps WebKit's own storage")
        XCTAssertTrue(store.values().isEmpty)
    }

    // MARK: Migration and writes

    func testMigrationThenEveryWriteReachesTheStoreExactly() throws {
        let temp = TempDir()
        let store = openStore(temp)
        let doc = Document(webkit: FacadeTests.json(Seed.values), store: store)
        XCTAssertEqual(doc.state("mode").toString(), "shadow", doc.state("why").toString())
        XCTAssertEqual(doc.state("label").toString(), "migrate")
        XCTAssertEqual(store.values(), pageView(doc), "one put copies everything WebKit holds but the API key")
        XCTAssertEqual(store.value("kt_user_name"), u("Kal") + [0xD83D], "a raw lone surrogate, exact")
        XCTAssertTrue(store.snapNames().contains { $0.hasSuffix("-migrate.json") })

        let big = "x".repeating(200_000)
        doc.js("""
            localStorage.setItem('kt_theme', 'dark');
            localStorage.setItem('kt_note', '\(big)');
            localStorage.setItem('kt_half', 'cut ' + String.fromCharCode(0xd83d));
            localStorage.setItem('kt_line', 'a' + String.fromCharCode(0x2028) + 'b' + String.fromCharCode(0) + 'c');
            localStorage.removeItem('kt_week');
            localStorage.setItem('kt_apikey', 'sk-ant-api03-new');
            """)
        XCTAssertEqual(doc.state("fallbacks").toInt32(), 0)
        XCTAssertEqual(store.values(), pageView(doc), "the store follows every write, exactly")
        XCTAssertEqual(store.value("kt_half"), u("cut ") + [0xD83D])
        XCTAssertNil(store.value("kt_week"))
        XCTAssertNil(store.value("kt_apikey"))
        XCTAssertTrue(doc.js("__ktStoreState.acked('kt_theme') && __ktStoreState.acked('kt_apikey')").toBool())
        for p in doc.prompts {
            XCTAssertFalse((p.head + "\n" + (p.payload ?? "")).contains("kt_apikey"), "the API key never crosses: \(p.head)")
        }

        // A relaunch: in step, on a new boot.
        let boot1 = doc.state("boot").toInt32()
        let next = Document(webkit: doc.webkitJSON, store: store)
        XCTAssertEqual(next.state("label").toString(), "in step")
        XCTAssertEqual(next.state("boot").toInt32(), boot1 + 1)
        XCTAssertEqual(store.status().lastHello?.rule, 0)
    }

    // MARK: Failures

    func testANativeFailureNeverReachesThePageAndTheGapNoteExplainsIt() throws {
        let temp = TempDir()
        let store = openStore(temp)
        let doc = Document(webkit: FacadeTests.json(Seed.values), store: store)
        for answer in ["full", "busy", "err", nil] as [String?] {
            doc.intercept = { head, payload in
                head.hasPrefix("w ") && (payload ?? "").hasPrefix("\"kt_bw\"") ? .some(answer) : nil
            }
            let value = "[{\"id\":\(Int.random(in: 1...1_000_000)),\"date\":\"2026-10-11\",\"lb\":181}]"
            let thrown = doc.js("(function () { try { localStorage.setItem('kt_bw', '\(value)'); return false; } catch (e) { return true; } })()")
            XCTAssertFalse(thrown.toBool(), "\(answer ?? "no answer"): the page's write never throws")
            XCTAssertEqual(doc.webkit("kt_bw"), u(value), "WebKit took it")
            XCTAssertNotEqual(store.value("kt_bw"), u(value), "the store missed it")
            let note = try XCTUnwrap(doc.webkit(KTProtocol.gapKey).flatMap { KTProtocol.GapNote.parse($0) })
            XCTAssertEqual(note.keys["kt_bw"], KTWire.hash(u(value)))
            XCTAssertEqual(note.stamps["kt_bw"]?.boot, Int64(doc.state("boot").toInt32()))
            XCTAssertEqual(note.stamps["kt_bw"]?.seq, Int64(doc.state("seq").toInt32()))
            XCTAssertFalse(doc.js("__ktStoreState.acked('kt_bw')").toBool())
            doc.intercept = nil
            XCTAssertEqual(doc.deliver(to: store), [.applied], "the async post lands")
            XCTAssertEqual(store.value("kt_bw"), u(value))
        }
        XCTAssertEqual(doc.state("fallbacks").toInt32(), 4)
        XCTAssertEqual(store.values(), pageView(doc))

        // remirror: the drain's re-send before the wrist's queue is cleared.
        doc.intercept = { head, payload in head.hasPrefix("w ") && (payload ?? "").hasPrefix("\"kt_sessions\"") ? .some("full") : nil }
        doc.js("localStorage.setItem('kt_sessions', '[]')")
        doc.intercept = nil
        XCTAssertFalse(doc.js("__ktStoreState.acked('kt_sessions')").toBool())
        XCTAssertTrue(doc.js("__ktStoreState.remirror('kt_sessions')").toBool())
        XCTAssertTrue(doc.js("__ktStoreState.acked('kt_sessions')").toBool())
        XCTAssertEqual(store.value("kt_sessions"), u("[]"))
        XCTAssertEqual(doc.deliver(to: store), [.stale], "the failed write's post is older than the re-send")
    }

    /// delete, Undo, delete again (the same kt_sessions twice), the last mirror answered full and its post lost:
    /// the next document start adopts it by the gap note and writes nothing into WebKit.
    func testARepeatedDeleteWhoseMirrorFailedIsAdoptedByTheGapNote() throws {
        let temp = TempDir()
        let store = openStore(temp)
        var doc = Document(webkit: FacadeTests.json(Seed.values), store: store)
        let s1 = #"[{"id":1,"date":"2026-10-01"}]"#, s2s1 = #"[{"id":2,"date":"2026-10-02"},{"id":1,"date":"2026-10-01"}]"#
        doc.js("localStorage.setItem('kt_sessions', '\(s2s1)'); localStorage.setItem('kt_sessions', '\(s1)'); localStorage.setItem('kt_sessions', '\(s2s1)')")
        doc.intercept = { head, payload in head.hasPrefix("w ") && (payload ?? "").hasPrefix("\"kt_sessions\"") ? .some("full") : nil }
        doc.js("localStorage.setItem('kt_sessions', '\(s1)')")
        doc.posts.removeAll()  // the app died before the post arrived
        let webkit = doc.webkitJSON
        doc = Document(webkit: webkit, store: store)
        XCTAssertEqual(doc.state("rule").toInt32(), 5)
        XCTAssertEqual(doc.state("label").toString(), "gap")
        XCTAssertEqual(store.value("kt_sessions"), u(s1), "the deletion stays deleted")
        XCTAssertEqual(doc.webkit("kt_sessions"), u(s1), "nothing rewritten")
        XCTAssertNil(doc.webkit(KTProtocol.gapKey), "the facade drops its note once the store has read it")
        XCTAssertTrue(store.conflicts().filter { $0.key == "kt_sessions" }.isEmpty, "a missed write's stale value is not offered back")
        XCTAssertEqual(store.values(), pageView(doc))
    }

    func testTheWitnessDecidesBetweenWouldRepairAndAdoption() throws {
        let temp = TempDir()
        let store = openStore(temp)
        var doc = Document(webkit: FacadeTests.json(Seed.values), store: store)
        doc.js("localStorage.setItem('kt_last_open', '1760100000999')")
        let saved = doc.webkitJSON
        doc.js("localStorage.setItem('kt_sessions', '[{\"id\":9,\"date\":\"2026-10-11\"}]'); localStorage.setItem('kt_last_open', '1760100001999')")
        doc = Document(webkit: saved, store: store)  // WebKit lost the last two writes in a hard kill
        XCTAssertEqual(doc.state("label").toString(), "lag")
        XCTAssertEqual(store.status().lastHello?.wouldRepair, ["kt_last_open", "kt_sessions"])
        XCTAssertEqual(store.values(), pageView(doc), "observe mode: WebKit is followed")

        doc.js("localStorage.setItem('kt_routine', '{}')")
        var older = doc.webkitAll
        older["kt_last_open"] = u("1700000000000")  // stamped by an older build
        older["kt_routine"] = nil
        doc = Document(webkit: FacadeTests.json(older), store: store)
        XCTAssertEqual(doc.state("label").toString(), "older build")
        XCTAssertNil(store.value("kt_routine"), "its deletion adopted, nothing refilled")
        XCTAssertNil(doc.webkit("kt_routine"))
    }

    func testWebKitWipedKeepsTheStoreAndPutBackRestoresBothCopies() throws {
        let temp = TempDir()
        let store = openStore(temp)
        var doc = Document(webkit: FacadeTests.json(Seed.values), store: store)
        let kept = store.values()
        doc = Document(webkit: "{}", store: store)
        XCTAssertEqual(doc.state("mode").toString(), "off")
        XCTAssertEqual(doc.state("why").toString(), "store: wiped")
        XCTAssertEqual(doc.webkitJSON, "{}", "nothing written into WebKit")
        doc.js("localStorage.setItem('kt_last_open', '1760200000000')")  // the page boots fresh, without the facade
        XCTAssertEqual(store.values(), kept)
        let snap = try XCTUnwrap(store.status().wipeOffer?.snap)

        doc = Document(webkit: doc.webkitJSON, store: store)  // the follow-up adopts the fresh page
        XCTAssertEqual(doc.state("rule").toInt32(), 4)
        XCTAssertGreaterThan(store.stagePutBack(snap: snap).count, 5)
        doc = Document(webkit: doc.webkitJSON, store: store)  // the shell reloads; Put back lands at document start
        XCTAssertGreaterThan(doc.state("putBack").toInt32(), 5)
        XCTAssertEqual(doc.webkit("kt_routine"), kept["kt_routine"])
        XCTAssertEqual(doc.webkit("kt_coach_msgs"), kept["kt_coach_msgs"])
        XCTAssertEqual(store.values(), pageView(doc), "Put back wrote WebKit and the store alike")
        XCTAssertFalse(store.status().putBackStaged)
    }

    func testWebKitUnreadableSendsHelloNowkAndAttachesNothing() {
        let temp = TempDir()
        let store = openStore(temp)
        _ = Document(webkit: FacadeTests.json(Seed.values), store: store)
        let kept = store.values()
        let doc = Document(webkit: "{}", store: store, flag: false)
        doc.js("Object.defineProperty(window, 'localStorage', { configurable: true, get: function () { var e = new Error('insecure'); e.name = 'SecurityError'; throw e; } })")
        doc.js(KTFacade.flagScript(shell: "60"))
        doc.js(KTFacade.source()!)
        XCTAssertEqual(doc.prompts.map(\.head), ["hello nowk"])
        XCTAssertEqual(doc.state("mode").toString(), "off")
        XCTAssertEqual(doc.state("why").toString(), "webkit unreadable")
        XCTAssertEqual(store.status().lastHello?.rule, 2)
        XCTAssertEqual(store.values(), kept, "never read as empty")
    }
}

private extension String {
    func repeating(_ n: Int) -> String { String(repeating: self, count: n) }
}
