import Foundation

/// The page facade (`Resources/ktstore.js`, plan task S3): build 60's storage facade, shadow only.
///
/// StoreAttach (FPHost, plan task S5) adds two user scripts at document start, in the main frame only, once
/// KTUIProxy is verified as the web view's uiDelegate: `flagScript(shell:)`, then `source()`. Without the flag the
/// facade does nothing at all (it never prompts), so a shell that cannot vouch for its prompt answerer leaves the
/// page on WebKit exactly as before. The facade writes WebKit first, mirrors every write synchronously over the
/// KT1 prompt channel (`KTProtocol`), and on any answer other than `ok` writes the gap note into WebKit and posts the
/// op to the `ktStore` script-message handler with its (boot, seq). `kt_apikey` never crosses the channel.
///
/// The Playwright store matrix (tests/lib/harness.js with STORE=shadow, specs 119 and 120) runs this same file over
/// tests/lib/ktstore-mock.js, the JavaScript reference of this module.
public enum KTFacade {
    /// The resource's base name and extension in FPStore's bundle.
    public static let resourceName = "ktstore"
    public static let resourceExtension = "js"

    /// The facade's source, nil when the resource is missing from the bundle (a packaging fault: the shell then
    /// injects neither script, and the page runs on WebKit as today).
    public static func source() -> String? {
        guard let url = Bundle.module.url(forResource: resourceName, withExtension: resourceExtension),
              let data = try? Data(contentsOf: url) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    /// `window.__ktStore = {"proto":1,"shell":"<build>"};`, the flag the facade requires (protocol 1). `shell` is
    /// this binary's build number (CFBundleVersion); it is written as a JSON string with U+2028/U+2029 escaped, so
    /// the script is valid whatever it holds.
    public static func flagScript(shell: String) -> String {
        "window.__ktStore = {\"proto\":\(KTProtocol.version),\"shell\":" + KTWire.quote(Array(shell.utf16)) + "};"
    }
}
