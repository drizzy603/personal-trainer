#if os(iOS)
import ImageIO
import UIKit
import UniformTypeIdentifiers
import XCTest
@testable import FPUI

/// The native composer prepares a photo as the page does (spec 20, "images downscale"): the long
/// edge capped at 1568 px, each side max(1, Math.round(side × scale)), JPEG at 0.82; a photo never
/// grows; the original goes as it is when it cannot be read.
final class CoachPhotoTests: XCTestCase {
    /// A solid image of `w` × `h` pixels as PNG (spec 20 draws #c8ff00 on a 4000 × 3000 canvas).
    private func png(_ w: Int, _ h: Int, orientation: Int? = nil) -> Data {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let image = UIGraphicsImageRenderer(size: CGSize(width: w, height: h), format: format).image { ctx in
            UIColor(red: 0xc8 / 255, green: 1, blue: 0, alpha: 1).setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
            UIColor.black.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: max(1, w / 10), height: max(1, h / 10)))   // a corner mark
        }
        guard let orientation else { return image.pngData()! }
        // the same pixels as a JPEG whose EXIF says to turn it
        let out = NSMutableData()
        let dest = CGImageDestinationCreateWithData(out, UTType.jpeg.identifier as CFString, 1, nil)!
        CGImageDestinationAddImage(dest, image.cgImage!, [kCGImagePropertyOrientation: orientation] as CFDictionary)
        CGImageDestinationFinalize(dest)
        return out as Data
    }

    private func pixelSize(_ data: Data) -> (Int, Int, String?) {
        let src = CGImageSourceCreateWithData(data as CFData, nil)!
        let p = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as! [CFString: Any]
        return ((p[kCGImagePropertyPixelWidth] as! NSNumber).intValue, (p[kCGImagePropertyPixelHeight] as! NSNumber).intValue,
                CGImageSourceGetType(src) as String?)
    }

    func testSpec20FourThousandByThreeThousandBecomes1568By1176Jpeg() throws {
        let big = png(4000, 3000)
        let out = try XCTUnwrap(CoachPhoto.prepare(big))
        XCTAssertEqual(out.mediaType, "image/jpeg")
        XCTAssertEqual(out.width, 1568)
        XCTAssertEqual(out.height, 1176)
        let (w, h, type) = pixelSize(out.data)
        XCTAssertEqual(w, 1568)
        XCTAssertEqual(h, 1176)
        XCTAssertEqual(type, UTType.jpeg.identifier)
        XCTAssertLessThan(out.data.count, big.count, "the downscale shrinks the payload")
        XCTAssertEqual(out.coachImage.mediaType, "image/jpeg")
        XCTAssertEqual(Data(base64Encoded: out.coachImage.data), out.data, "base64 with no data: prefix")
    }

    func testTargetSizeIsThePagesRule() {
        // (w, h) -> the page's max(1, Math.round(side * min(1, 1568 / long edge)))
        func js(_ w: Int, _ h: Int) -> (Int, Int) {
            let s = min(1, 1568 / Double(max(w, h)))
            func r(_ x: Double) -> Int { Int(floor(x + 0.5)) }
            return (max(1, r(Double(w) * s)), max(1, r(Double(h) * s)))
        }
        let cases = [(4000, 3000), (3000, 4000), (1000, 800), (1568, 1568), (1569, 1), (1, 5000), (3137, 2000),
                     (3136, 3), (4032, 3024), (12000, 9000), (2, 1), (1568 * 3, 5)]
        for (w, h) in cases {
            let got = CoachPhoto.targetSize(width: w, height: h)
            let want = js(w, h)
            XCTAssertEqual(got.width, want.0, "\(w)x\(h)")
            XCTAssertEqual(got.height, want.1, "\(w)x\(h)")
        }
        XCTAssertEqual(CoachPhoto.targetSize(width: 3136, height: 3).height, 2, "a half rounds up, as Math.round")
        XCTAssertEqual(CoachPhoto.targetSize(width: 3000, height: 4000).width, 1176)
    }

    func testSmallPhotoKeepsItsSizeAsJpeg() throws {
        let out = try XCTUnwrap(CoachPhoto.prepare(png(800, 600)))
        XCTAssertEqual(out.mediaType, "image/jpeg")
        XCTAssertEqual(out.width, 800)
        XCTAssertEqual(out.height, 600)
        let (w, h, _) = pixelSize(out.data)
        XCTAssertEqual([w, h], [800, 600])
    }

    func testTurnedPhotoIsDrawnUpright() throws {
        // stored 3000 x 2000, EXIF 6 (turn a quarter clockwise): upright it is 2000 x 3000
        let out = try XCTUnwrap(CoachPhoto.prepare(png(3000, 2000, orientation: 6)))
        XCTAssertEqual(out.width, 1045)
        XCTAssertEqual(out.height, 1568)
        let (w, h, _) = pixelSize(out.data)
        XCTAssertEqual([w, h], [1045, 1568])
    }

    func testUnreadableBytesGoAsTheyAreOrNotAtAll() {
        var fakePNG = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
        fakePNG.append(Data(repeating: 7, count: 64))
        let out = CoachPhoto.prepare(fakePNG)
        XCTAssertEqual(out?.mediaType, "image/png", "the page sends the original when it cannot draw it")
        XCTAssertEqual(out?.data, fakePNG)
        XCTAssertNil(CoachPhoto.prepare(Data("not an image".utf8)))
        XCTAssertNil(CoachPhoto.prepare(Data()))
    }

    func testConstants() {
        XCTAssertEqual(CoachPhoto.maxEdge, 1568)
        XCTAssertEqual(CoachPhoto.jpegQuality, 0.82, accuracy: 0.0001)
    }
}
#endif
