import Foundation

/// `get()` for the cases' `Result<_, Error>` (a page message's answer: `try await message(...).get()`), thrown with a
/// plain `throw`.
///
/// Xcode's test host (26.6 to 27.2) names the error a case threw from the last one its hook saw (`_swift_willThrow`,
/// set by Testing.framework), and the standard library's `get()` rethrows with a typed throw that never calls the hook.
/// So a case that ended on a refusal was reported under whatever had been thrown last anywhere in the process, caught
/// there or not: `InvalidTransition { phase: idle, targetPhase: failed(disabled) }` of the system's gesture machinery
/// (some forty a scene with a tab root), CoreGraphics' `DecodingError`, ExtensionKit's "Client not entitled" (CI runs
/// 42522381728 and 42529061751 read as if the shell had thrown those; each was a case's own `off: no live tab root`
/// after its tab root had fallen back). Thrown from here the hook sees the case's own error, and the failure line
/// carries its words.
extension Result where Failure == any Error {
    func get() throws -> Success {
        switch self {
        case .success(let value): return value
        case .failure(let error): throw error
        }
    }
}
