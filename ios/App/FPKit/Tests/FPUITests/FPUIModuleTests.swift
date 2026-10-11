#if os(iOS)
import XCTest
@testable import FPUI
import FPCore

final class FPUIModuleTests: XCTestCase {
    func testModuleName() {
        XCTAssertEqual(FPUIModule.name, "FPUI")
        XCTAssertEqual(FPUIModule.builtOn, ["FPCore"])
    }
}
#endif
