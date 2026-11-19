import Capacitor
import Foundation

/// The share sheet's photo, handed from the share extension (ios/App/TrovoShareExtension) through the App Group, and the
/// iCloud backup writes.
///
/// A share as build 62's extension leaves it: `pendingShare.json` {v: 1, id, at, bytes, comment} written first, then
/// `pendingShare.jpg`, each atomically, in the group's container. The words travel in the file, so they are there as soon
/// as the photo is: a value in the group's UserDefaults reached the app through cfprefsd, and a cold share on iOS 27.2
/// arrived without its words. The two are a pair while the json's `bytes` is the jpg's size. Build 61's extension left
/// the jpg with the words in the group's defaults (`pendingShareComment`), and older ones the photo in base64
/// (`pendingShareImage`): both are still read, and deleted, for a share made before the update.
@objc(TrovoSharePlugin)
public class TrovoSharePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TrovoSharePlugin"
    public let jsName = "TrovoShare"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getPendingShare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearPendingShare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveToICloud",    returnType: CAPPluginReturnPromise),
    ]

    static let group = "group.app.kt.trainer"
    static let photoName = "pendingShare.jpg"
    static let wordsName = "pendingShare.json"

    /// A words file: the share's id, its photo's byte count (the pairing) and the words.
    struct Words {
        let id: String
        let bytes: Int
        let comment: String
    }

    /// The words file at `url`, when it is one (an id and a byte count; no words read as '').
    static func words(_ url: URL) -> Words? {
        guard let data = try? Data(contentsOf: url),
              let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let id = o["id"] as? String, !id.isEmpty,
              let bytes = (o["bytes"] as? NSNumber)?.intValue else { return nil }
        return Words(id: id, bytes: bytes, comment: o["comment"] as? String ?? "")
    }

    /// getPendingShare({keep?}): the share waiting in the App Group, as {imageBase64, comment}; {imageBase64: null,
    /// comment: ''} when there is none. With `keep` (build 62's page, which keeps its own copy and then clears this one by
    /// id) a paired share stays where it is and the answer adds its `id`. Anything else is read and deleted as build 61
    /// read it: the photo (the file, else the legacy base64 slot), the legacy keys, and the words file when it is the
    /// photo's pair, whose words it answers (else the legacy `pendingShareComment`'s). A words file that is not the
    /// photo's pair (a newer share's, written before its photo) is left for its photo.
    @objc public func getPendingShare(_ call: CAPPluginCall) {
        let keep = call.getBool("keep") ?? false
        guard let defaults = UserDefaults(suiteName: Self.group) else {
            call.resolve(["imageBase64": NSNull(), "comment": ""])
            return
        }
        let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Self.group)
        let photoURL = dir?.appendingPathComponent(Self.photoName)
        let wordsURL = dir?.appendingPathComponent(Self.wordsName)
        var base64: String? = nil
        var fromFile = false
        var pair: Words? = nil
        if let photoURL, let data = try? Data(contentsOf: photoURL) {
            base64 = data.base64EncodedString()
            fromFile = true
            if let wordsURL, let w = Self.words(wordsURL), w.bytes == data.count { pair = w }
        }
        // the base64 slot is read for one more release, so a share made before an update still lands
        if base64 == nil { base64 = defaults.string(forKey: "pendingShareImage") }
        guard let img = base64 else {
            call.resolve(["imageBase64": NSNull(), "comment": ""])
            return
        }
        if keep, let pair {
            call.resolve(["imageBase64": img, "comment": pair.comment, "id": pair.id])
            return
        }
        let comment = pair?.comment ?? defaults.string(forKey: "pendingShareComment") ?? ""
        if fromFile, let photoURL { try? FileManager.default.removeItem(at: photoURL) }
        if pair != nil, let wordsURL { try? FileManager.default.removeItem(at: wordsURL) }
        defaults.removeObject(forKey: "pendingShareImage")
        defaults.removeObject(forKey: "pendingShareComment")
        defaults.synchronize()
        call.resolve(["imageBase64": img, "comment": comment])
    }

    /// clearPendingShare({id}): the page holds its own copy of the share it was answered `id` with (kept, or the photo
    /// sent, removed or replaced), so the App Group's copy goes: the photo, then its words file, and the legacy keys,
    /// while the words file still names that id -> {cleared: true}. A newer share written since (its words file names
    /// another id) stays for the next read, and nothing there at all is nothing to clear -> {cleared: false}. The words
    /// file is read again before it goes: a newer share writes its words before its photo, so the photo removed after the
    /// first read is still this share's, and words that turned into a newer share's in between are left for their photo.
    @objc public func clearPendingShare(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), !id.isEmpty else {
            call.reject("id required")
            return
        }
        guard let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Self.group) else {
            call.resolve(["cleared": false])
            return
        }
        let wordsURL = dir.appendingPathComponent(Self.wordsName)
        guard Self.words(wordsURL)?.id == id else {
            call.resolve(["cleared": false])
            return
        }
        try? FileManager.default.removeItem(at: dir.appendingPathComponent(Self.photoName))
        if Self.words(wordsURL)?.id == id { try? FileManager.default.removeItem(at: wordsURL) }
        if let defaults = UserDefaults(suiteName: Self.group) {
            defaults.removeObject(forKey: "pendingShareImage")
            defaults.removeObject(forKey: "pendingShareComment")
            defaults.synchronize()
        }
        call.resolve(["cleared": true])
    }

    // Writes a text file into the app's iCloud Drive folder (Documents), so
    // backups survive a lost or dead phone. Resolves {saved:false, reason}
    // instead of rejecting when iCloud is off — callers treat it as best-effort.
    @objc public func saveToICloud(_ call: CAPPluginCall) {
        guard let name = call.getString("name"), let content = call.getString("content"),
              !name.contains("/"), !name.hasPrefix(".") else {
            call.reject("name/content required")
            return
        }
        // url(forUbiquityContainerIdentifier:) can block — never on main thread.
        DispatchQueue.global(qos: .utility).async {
            guard let container = FileManager.default.url(forUbiquityContainerIdentifier: nil) else {
                DispatchQueue.main.async { call.resolve(["saved": false, "reason": "icloud-unavailable"]) }
                return
            }
            let docs = container.appendingPathComponent("Documents", isDirectory: true)
            do {
                try FileManager.default.createDirectory(at: docs, withIntermediateDirectories: true)
                let url = docs.appendingPathComponent(name)
                try content.data(using: .utf8)?.write(to: url, options: .atomic)
                DispatchQueue.main.async { call.resolve(["saved": true]) }
            } catch {
                let reason = error.localizedDescription
                DispatchQueue.main.async { call.resolve(["saved": false, "reason": reason]) }
            }
        }
    }
}
