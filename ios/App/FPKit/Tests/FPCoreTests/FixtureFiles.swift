import Foundation
import FPCore

/// The test target's Fixtures folder (a copied resource).
enum FixtureFiles {
    static let root: URL = Bundle.module.resourceURL!.appendingPathComponent("Fixtures", isDirectory: true)

    static func url(_ path: String) -> URL { root.appendingPathComponent(path) }

    static func data(_ path: String) throws -> Data { try Data(contentsOf: url(path)) }

    static func text(_ path: String) throws -> String { String(decoding: try data(path), as: UTF8.self) }

    static func json(_ path: String) throws -> JSONValue { try JSONText.parse(utf8: data(path)) }

    /// The files in a fixture folder with this extension, by name.
    static func files(in dir: String, ext: String = "json") -> [URL] {
        let folder = root.appendingPathComponent(dir, isDirectory: true)
        let names = (try? FileManager.default.contentsOfDirectory(atPath: folder.path)) ?? []
        return names.filter { $0.hasSuffix("." + ext) }.sorted().map { folder.appendingPathComponent($0) }
    }
}
