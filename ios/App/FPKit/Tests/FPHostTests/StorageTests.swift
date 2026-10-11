#if os(iOS)
import Foundation
import XCTest
import FPCore
import FPStore
@testable import FPHost

/// What Settings > About > Storage reaches through the TrovoStore plugin (plan task S6): the test quit's arm and record,
/// the shell flag's dev arguments, and StoreAttach's Storage calls while the store is not open.
@MainActor
final class StorageTests: XCTestCase {
    func testTheQuitArmFiresOnlyOnAnAcknowledgedSaveOfAKeyItWaitsFor() {
        let t0 = Date(timeIntervalSince1970: 1_760_000_000)
        let arm = StoreTestQuit.Arm(at: t0, keys: ["kt_runner_draft", "kt_sessions"])
        XCTAssertTrue(arm.fires(op: "w", key: "kt_runner_draft", at: t0.addingTimeInterval(5)))
        XCTAssertTrue(arm.fires(op: "d", key: "kt_sessions", at: t0.addingTimeInterval(5)), "a remove is a save too")
        XCTAssertFalse(arm.fires(op: "w", key: "kt_last_open", at: t0), "the app's bookkeeping never ends the app")
        XCTAssertFalse(arm.fires(op: "c", key: "kt_sessions", at: t0), "a clear is not a save of a key")
        XCTAssertFalse(arm.fires(op: "w", key: nil, at: t0))
        XCTAssertFalse(arm.fires(op: "w", key: "kt_sessions", at: t0.addingTimeInterval(StoreTestQuit.armSeconds + 1)),
                       "ten minutes on, the arm is spent")
        XCTAssertTrue(StoreTestQuit.Arm(at: t0, keys: []).fires(op: "w", key: "kt_anything", at: t0), "no keys: any save")
    }

    func testTheRecordSurvivesAsAFileWithWhatTheNextStartFound() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("StorageTests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let file = StoreTestQuitFile(url: dir.appendingPathComponent(StoreAttach.testQuitName))
        XCTAssertNil(file.read(), "no test yet")
        let t0 = Date(timeIntervalSince1970: 1_760_000_000.5)
        var record = StoreTestQuit(armedAt: t0, firedAt: t0.addingTimeInterval(30), key: "kt_runner_draft", op: "w", shell: "60", page: "20261011-1")
        XCTAssertTrue(file.write(record))
        XCTAssertEqual(file.read(), record)
        record.after = StoreTestQuit.After(at: t0.addingTimeInterval(90), rule: 6, label: "lag", wouldRepair: ["kt_runner_draft"],
                                           adopted: ["lag": ["kt_runner_draft"]])
        XCTAssertTrue(file.write(record))
        let back = try XCTUnwrap(file.read())
        XCTAssertEqual(back.after?.rule, 6)
        XCTAssertEqual(back.after?.wouldRepair, ["kt_runner_draft"])
        XCTAssertEqual(back.firedAt.timeIntervalSince1970, t0.addingTimeInterval(30).timeIntervalSince1970, accuracy: 0.001)
        try Data("not json".utf8).write(to: file.url)
        XCTAssertNil(file.read(), "a garbled record is no record")
    }

    /// -devNav/-devTheme as separate words become the flag's dev; no arguments, no dev key at all.
    func testTheShellFlagCarriesTheToolsLaunchArguments() throws {
        let dev = ShellFlagScript.Dev(arguments: ["App", "-devNav", "settings/storage-sheet", "-devTheme", "dark"])
        XCTAssertEqual(dev, ShellFlagScript.Dev(nav: "settings/storage-sheet", theme: "dark"))
        XCTAssertEqual(ShellFlagScript.Dev(arguments: ["App", "-devNav"]), ShellFlagScript.Dev(), "a missing value is none")
        XCTAssertEqual(ShellFlagScript.Dev(arguments: ["App", "-devNav", "-devTheme", "dark"]).nav, nil, "the next option is not a value")
        let script = ShellFlagScript.flag(shell: "60", dev: dev).script
        XCTAssertTrue(script.hasPrefix("window.__FP_SHELL = {"), script)
        let json = String(script.dropFirst("window.__FP_SHELL = ".count).dropLast())
        let obj = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any])
        XCTAssertEqual(obj["v"] as? Int, 1)
        XCTAssertEqual(obj["min"] as? Int, 1)
        XCTAssertEqual(obj["shell"] as? String, "60")
        XCTAssertEqual(obj["screens"] as? [String], [], "no native screen in the store half")
        XCTAssertEqual(obj["dev"] as? [String: String], ["nav": "settings/storage-sheet", "theme": "dark"])
        let plain = ShellFlagScript.flag(shell: "60").script
        XCTAssertFalse(plain.contains("dev"), plain)
        #if DEBUG
        XCTAssertTrue(ShellFlagScript.script(shell: "61", arguments: ["App", "-devNav", "log/run"]).contains("log/run"),
                      "a Debug build reads the launch arguments")
        #endif
    }

    /// With no store open (a test host never opens one), Storage's calls refuse or come back empty, and the status says
    /// so with the switch and the test's state.
    func testStorageCallsWithoutAStore() throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "StorageTests-\(UUID().uuidString)"))
        let attach = StoreAttach(defaults: defaults)
        XCTAssertTrue(attach.conflictsJSON(limit: 10).isEmpty)
        XCTAssertThrowsError(try attach.putBack(conflicts: [1], snap: nil, wipe: false, preview: true))
        XCTAssertThrowsError(try attach.exportCopy())
        XCTAssertFalse(attach.armTestQuit(keys: ["kt_sessions"]), "nothing to acknowledge a save, nothing armed")
        XCTAssertFalse(attach.testQuitArmed)
        let st = attach.statusJSON()
        XCTAssertEqual(st["facade"] as? String, "waiting")
        XCTAssertEqual(st["deviceSwitchOn"] as? Bool, true)
        XCTAssertEqual(st["testQuitArmed"] as? Bool, false)
        XCTAssertNil(st["store"], "no store, no store status")
        attach.setNativeCopy(on: false)
        XCTAssertFalse(attach.deviceSwitchOn)
        XCTAssertEqual(defaults.bool(forKey: StoreAttach.deviceSwitchKey), true)
        attach.setNativeCopy(on: true)
        XCTAssertTrue(attach.deviceSwitchOn)
    }
}
#endif
