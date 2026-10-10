import Foundation
import XCTest
import FPCore

final class FPCoreModuleTests: XCTestCase {
    /// FPCore is Foundation only (the plan, section 4): `swift test` covers it on the Mac and every FPKit
    /// module can build on it. The compiler cannot hold that line on the Mac, where WebKit, SwiftUI and
    /// SQLite3 all import fine, so this reads every FPCore source and fails on any other import.
    func testSourcesImportFoundationOnly() throws {
        let sources = Self.packageRoot.appendingPathComponent("Sources/\(FPCoreModule.name)", isDirectory: true)
        let files = Self.swiftFiles(under: sources)
        XCTAssertFalse(files.isEmpty, "no Swift sources under \(sources.path)")
        for file in files {
            let others = try Self.importedModules(in: file).subtracting(["Foundation"])
            XCTAssertTrue(others.isEmpty, "\(file.lastPathComponent) imports \(others.sorted().joined(separator: ", ")): "
                + "FPCore is Foundation only; platform code belongs in FPHost or FPUI, SQLite in FPStore")
        }
    }

    /// ios/App/FPKit, from this file's path (Tests/FPCoreTests/FPCoreModuleTests.swift).
    private static let packageRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()  // FPCoreTests
        .deletingLastPathComponent()  // Tests
        .deletingLastPathComponent()  // FPKit

    private static func swiftFiles(under dir: URL) -> [URL] {
        guard let walk = FileManager.default.enumerator(at: dir, includingPropertiesForKeys: nil) else { return [] }
        return walk.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }.sorted { $0.path < $1.path }
    }

    /// The top-level module of every import line: `import X`, `import X.Y`, `import struct X.Y`,
    /// `@testable import X`, `@preconcurrency import X`.
    private static func importedModules(in file: URL) throws -> Set<String> {
        let kinds: Set<Substring> = ["typealias", "struct", "class", "enum", "protocol", "let", "var", "func"]
        var modules = Set<String>()
        for line in try String(contentsOf: file, encoding: .utf8).split(whereSeparator: \.isNewline) {
            var words = line.split(whereSeparator: \.isWhitespace)[...]
            while let first = words.first, first.hasPrefix("@") { words = words.dropFirst() }
            guard words.first == "import" else { continue }
            words = words.dropFirst()
            if let first = words.first, kinds.contains(first) { words = words.dropFirst() }
            guard let path = words.first else { continue }
            let module = path.prefix { $0.isLetter || $0.isNumber || $0 == "_" }
            if !module.isEmpty { modules.insert(String(module)) }
        }
        return modules
    }
}
