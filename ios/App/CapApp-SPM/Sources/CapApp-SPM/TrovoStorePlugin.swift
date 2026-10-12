import Foundation
import Capacitor
import UIKit
import WebKit
import os.log

private let storeLog = Logger(subsystem: "app.kt.trainer", category: "store")

// Settings > About > Storage (build 60+, plan task S6): the page's window onto the native copy of the owner's data
// (FPKit's FPStore, kept in shadow beside WebKit's localStorage by the shell's facade). FPKit does the work; this
// plugin is thin and reaches it through a host the App target sets (an adapter over FPHost's StoreAttach in
// AppDelegate.swift), because CapApp-SPM cannot depend on FPKit: the Capacitor CLI rewrites its Package.swift.
//
// Methods (calls arrive off the main thread and hop to it):
//   status()                                  the attachment and the store, as StoreAttach.status() reports them,
//                                             plus testKill (whether "Test: quit after next save" is offered here)
//   conflicts({limit})                        {rows}: the values the store gave up in the last 30 days, newest first
//   putBack({conflicts | snap | wipe, preview})
//                                             {items, count, staged}: what Put back would do, or staged for the next
//                                             document start, after which the page is reloaded so the facade writes
//                                             the values into WebKit before the page's first script
//   setSwitch({on})                           the Native copy switch (this device; from the next document start;
//                                             on also lets a copy paused after a crash come back)
//   exportCopy()                              the store as one JSON file, handed to the share sheet
//   testKill({arm, keys})                     TestFlight and Debug builds only: the app quits right after the next save
//                                             of one of `keys` the store acknowledges (FPHost StoreTestQuit)

/// What the TrovoStore plugin needs from FPKit. Called on the main thread.
@MainActor
public protocol TrovoStoreHost: AnyObject {
    func storeStatus() -> [String: Any]
    func storeConflicts(limit: Int) -> [[String: Any]]
    func storePutBack(conflicts: [Int64], snap: String?, wipe: Bool, preview: Bool) throws -> [String: Any]
    func storeSetSwitch(on: Bool) -> [String: Any]
    func storeExport() throws -> (data: Data, keys: Int)
    /// Arms (or disarms) "Test: quit after next save"; whether it is armed now.
    func storeArmTestQuit(_ on: Bool, keys: [String]) -> Bool
}

@objc(TrovoStorePlugin)
public class TrovoStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TrovoStorePlugin"
    public let jsName = "TrovoStore"
    public let pluginMethods: [CAPPluginMethod] = {
        var m: [CAPPluginMethod] = [
            CAPPluginMethod(name: "status",     returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "conflicts",  returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "putBack",    returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "setSwitch",  returnType: CAPPluginReturnPromise),
            CAPPluginMethod(name: "exportCopy", returnType: CAPPluginReturnPromise),
        ]
        // Only where the test is offered, so an App Store page never even sees the method.
        if TrovoStorePlugin.testKillAllowed { m.append(CAPPluginMethod(name: "testKill", returnType: CAPPluginReturnPromise)) }
        return m
    }()

    /// Set by the App target before registration.
    public var host: TrovoStoreHost?

    /// "Test: quit after next save" is for TestFlight and Debug builds: never an App Store build.
    public static let testKillAllowed: Bool = {
        #if DEBUG
        return true
        #else
        return Bundle.main.appStoreReceiptURL?.lastPathComponent == "sandboxReceipt"
        #endif
    }()

    /// Runs `body` with the host on the main thread; rejects when the App target set none.
    private func onMain(_ call: CAPPluginCall, _ body: @escaping @MainActor (TrovoStoreHost) -> Void) {
        DispatchQueue.main.async { [weak self] in
            MainActor.assumeIsolated {
                guard let host = self?.host else { call.reject("the native copy is not available"); return }
                body(host)
            }
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        onMain(call) { host in
            var st = host.storeStatus()
            st["testKill"] = TrovoStorePlugin.testKillAllowed
            call.resolve(st)
        }
    }

    @objc func conflicts(_ call: CAPPluginCall) {
        let limit = call.getInt("limit") ?? 100
        onMain(call) { host in call.resolve(["rows": host.storeConflicts(limit: limit)]) }
    }

    @objc func putBack(_ call: CAPPluginCall) {
        let ids: [Int64] = (call.getArray("conflicts") ?? []).compactMap { ($0 as? NSNumber)?.int64Value }
        let snap = call.getString("snap")
        let wipe = call.getBool("wipe") ?? false
        let preview = call.getBool("preview") ?? false
        onMain(call) { [weak self] host in
            do {
                let out = try host.storePutBack(conflicts: ids, snap: snap, wipe: wipe, preview: preview)
                call.resolve(out)
                guard (out["staged"] as? Bool) == true else { return }
                // A new document: the facade writes the staged values into WebKit (and the store) at its start, before
                // the page's first script. A short wait lets the page take the answer first.
                storeLog.info("store: Put back staged, reloading the page")
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { self?.bridge?.webView?.reload() }
            } catch {
                call.reject("\(error)")
            }
        }
    }

    @objc func setSwitch(_ call: CAPPluginCall) {
        guard let on = call.getBool("on") else { call.reject("on required"); return }
        onMain(call) { host in call.resolve(host.storeSetSwitch(on: on)) }
    }

    @objc func exportCopy(_ call: CAPPluginCall) {
        onMain(call) { [weak self] host in
            let copy: (data: Data, keys: Int)
            do { copy = try host.storeExport() } catch { call.reject("\(error)"); return }
            let day = DateFormatter()
            day.locale = Locale(identifier: "en_US_POSIX")
            day.dateFormat = "yyyy-MM-dd"
            // Never a supero-backup-* name: this is not a backup the page restores from.
            let name = "fitness-programmer-native-copy-\(day.string(from: Date())).json"
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
            do {
                try copy.data.write(to: url, options: [.atomic, .completeFileProtection])
            } catch {
                call.reject("could not write the copy: \(error.localizedDescription)")
                return
            }
            // Present from whatever is on top (a sheet, the native chat), never twice.
            var top = self?.bridge?.viewController
            while let shown = top?.presentedViewController { top = shown }
            guard let vc = top, !(vc is UIActivityViewController) else {
                try? FileManager.default.removeItem(at: url)
                call.reject(top == nil ? "no screen to share from" : "a share sheet is already open")
                return
            }
            let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            sheet.completionWithItemsHandler = { type, completed, _, error in
                try? FileManager.default.removeItem(at: url)
                if let error { call.reject(error.localizedDescription); return }
                call.resolve(["shared": completed, "activity": type?.rawValue ?? "", "name": name,
                              "bytes": copy.data.count, "keys": copy.keys])
            }
            if let pop = sheet.popoverPresentationController {
                // A popover needs a source (iPad), and iOS 26+ zooms the sheet out of it on an iPhone too: the bottom
                // edge's middle, where the sheet rises from anyway (the button that asked is in the page).
                pop.sourceView = vc.view
                pop.sourceRect = CGRect(x: vc.view.bounds.midX, y: vc.view.bounds.maxY - 1, width: 1, height: 1)
                pop.permittedArrowDirections = []
            }
            vc.present(sheet, animated: true)
        }
    }

    @objc func testKill(_ call: CAPPluginCall) {
        guard TrovoStorePlugin.testKillAllowed else { call.reject("only on TestFlight"); return }
        let arm = call.getBool("arm") ?? true
        let keys = (call.getArray("keys") ?? []).compactMap { $0 as? String }
        onMain(call) { host in call.resolve(["armed": host.storeArmTestQuit(arm, keys: keys)]) }
    }
}
