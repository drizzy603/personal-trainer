// swift-tools-version: 5.9
//
// FPKit: the native half of Fitness Programmer's move from the Capacitor web view to SwiftUI.
// See README.md for what each target holds and how to test.
//
// Swift 5 language mode. iOS 17 for the app; macOS 14 so `swift test` runs FPCore and FPStore on the Mac.
// FPHost and FPUI keep every source inside `#if os(iOS)`, so on the Mac they build as empty modules.
//
// Each target sits in its own block below. A branch that changes a target's declaration (resources,
// settings, dependencies) changes only that block, so parallel branches merge cleanly.
import PackageDescription

let package = Package(
    name: "FPKit",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "FPCore", targets: ["FPCore"]),
        .library(name: "FPStore", targets: ["FPStore"]),
        .library(name: "FPHost", targets: ["FPHost"]),
        .library(name: "FPUI", targets: ["FPUI"]),
    ],
    targets: [
        // FPCore: Foundation only. Contract, coach model, surrogate mend, intents, link, breaker, policy.
        .target(
            name: "FPCore"
        ),

        // FPStore: FPCore plus the system SQLite3 (the SDK's module; linked as libsqlite3).
        .target(
            name: "FPStore",
            dependencies: ["FPCore"],
            linkerSettings: [.linkedLibrary("sqlite3")]
        ),

        // FPHost: iOS only (WebKit). StoreAttach, KTUIProxy, crash markers, the policy fetch.
        .target(
            name: "FPHost",
            dependencies: ["FPCore", "FPStore"]
        ),

        // FPUI: iOS only (SwiftUI). ScreenHost, PageLink, theme tokens, fonts, the Coach views.
        .target(
            name: "FPUI",
            dependencies: ["FPCore"]
        ),

        // FPCoreTests: run by `swift test` on the Mac.
        .testTarget(
            name: "FPCoreTests",
            dependencies: ["FPCore"]
        ),

        // FPStoreTests: run by `swift test` on the Mac. Vectors/vectors.json comes from
        // tests/tools/ktstore-vectors.js (what the facade's JavaScript sends).
        .testTarget(
            name: "FPStoreTests",
            dependencies: ["FPStore"],
            resources: [.copy("Vectors")]
        ),
    ],
    swiftLanguageVersions: [.v5]
)
