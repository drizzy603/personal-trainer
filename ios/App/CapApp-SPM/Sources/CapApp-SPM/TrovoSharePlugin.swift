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

    /// The size of the file at `url` now, nil when there is none.
    static func size(_ url: URL) -> Int? {
        ((try? FileManager.default.attributesOfItem(atPath: url.path))?[.size] as? NSNumber)?.intValue
    }

    /// Removes the file at `url`: true once it is gone (removed, or there was none), false when the removal failed for
    /// any other reason (the file is still there).
    static func remove(_ url: URL) -> Bool {
        do {
            try FileManager.default.removeItem(at: url)
            return true
        } catch {
            let e = error as NSError
            if e.domain == NSCocoaErrorDomain, e.code == NSFileNoSuchFileError || e.code == NSFileReadNoSuchFileError { return true }
            if e.domain == NSPOSIXErrorDomain, e.code == Int(ENOENT) { return true }
            return false
        }
    }

    /// getPendingShare({keep?}): the share waiting in the App Group, as {imageBase64, comment}; {imageBase64: null,
    /// comment: ''} when there is none. With `keep` (build 62's page, which keeps its own copy and then clears this one by
    /// id) a paired share stays where it is and the answer adds its `id`. Anything else is read and deleted as build 61
    /// read it: the photo (the file, else the legacy base64 slot), the legacy keys, and the words file when it is the
    /// photo's pair, whose words it answers (else the legacy `pendingShareComment`'s). A words file that is not the
    /// photo's pair (a newer share's, written before its photo) is left for its photo. Each file is checked again right
    /// before it goes (build 62's review, F-S3): the photo only while its size is still the bytes read, the words file
    /// only while it still names the pair read, so a newer share the extension wrote meanwhile (its words, then its photo
    /// renamed into place) stays whole for the next read.
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
        var read: Int? = nil
        var pair: Words? = nil
        if let photoURL, let data = try? Data(contentsOf: photoURL) {
            base64 = data.base64EncodedString()
            read = data.count
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
        if let read, let photoURL, Self.size(photoURL) == read { _ = Self.remove(photoURL) }
        if let pair, let wordsURL, Self.words(wordsURL)?.id == pair.id { _ = Self.remove(wordsURL) }
        defaults.removeObject(forKey: "pendingShareImage")
        defaults.removeObject(forKey: "pendingShareComment")
        defaults.synchronize()
        call.resolve(["imageBase64": img, "comment": comment])
    }

    /// clearPendingShare({id}): the page holds its own copy of the share it was answered `id` with (kept, or the photo
    /// sent, removed or replaced), so the App Group's copy goes: the photo, then its words file, and the legacy keys,
    /// while the words file still names that id -> {cleared: true}. A newer share written since (its words file names
    /// another id) stays for the next read, and nothing there at all is nothing to clear -> {cleared: false}. Each file is
    /// checked again right before it goes (build 62's review, F-S3): the photo only while its size is still the words
    /// file's `bytes` (a newer share writes its words, then renames its photo into place: one renamed in since the first
    /// read stays, and the answer is {cleared: false}, a newer share waiting), the words file only while it still names
    /// that id (words that turned into a newer share's are left for their photo). A removal that fails for anything but
    /// a file already gone rejects the call when it is the photo's (review round 2), before the words file is touched, so
    /// the pair stays whole and the page's error path ('share: not cleared (error)') asks again at its next read of that
    /// id, where {cleared: false} would read as a newer share waiting and never be asked again. The words file's own
    /// removal failing after the photo went answers as cleared: no read can answer that share again (round 3).
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
        guard let w = Self.words(wordsURL), w.id == id else {
            call.resolve(["cleared": false])
            return
        }
        let photoURL = dir.appendingPathComponent(Self.photoName)
        var cleared = true
        if let n = Self.size(photoURL) {
            if n != w.bytes { cleared = false }   // not this share's photo: it stays
            else if !Self.remove(photoURL) { call.reject("the share's photo could not be removed"); return }   // pair kept
        }
        // Once the photo is gone the share is: every read answers by its photo, a words file left alone pairs with
        // nothing, and the next share writes its own over it, so a words removal that fails changes no answer (round 3).
        if Self.words(wordsURL)?.id == id { _ = Self.remove(wordsURL) }
        if let defaults = UserDefaults(suiteName: Self.group) {
            defaults.removeObject(forKey: "pendingShareImage")
            defaults.removeObject(forKey: "pendingShareComment")
            defaults.synchronize()
        }
        call.resolve(["cleared": cleared])
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
