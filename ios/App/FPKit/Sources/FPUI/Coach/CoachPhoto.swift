#if os(iOS)
import Foundation
import ImageIO
import UIKit
import UniformTypeIdentifiers
import FPCore

/// A photo for the coach, prepared as the page prepares one (plan task C6; the page's
/// `_downscaleImage`, held by spec 20): the long edge capped at 1568 px (the model downsamples past
/// it anyway, and a 4 MB camera photo bought only a slow upload and the most image tokens on every
/// tool round), each side `max(1, round(side × scale))`, re-encoded as JPEG at quality 0.82. The
/// photo is drawn upright (its orientation applied, as the browser's canvas draws it). When it
/// cannot be decoded, the original goes as it is, as the page falls back.
public enum CoachPhoto {
    public static let maxEdge = 1568
    public static let jpegQuality: CGFloat = 0.82

    /// The size the page would draw a `width` × `height` photo at.
    public static func targetSize(width: Int, height: Int) -> (width: Int, height: Int) {
        guard width > 0, height > 0 else { return (max(1, width), max(1, height)) }
        let scale = min(1, Double(maxEdge) / Double(max(width, height)))
        // JavaScript's Math.round: halves go up (positive sides only here)
        func round(_ x: Double) -> Int { Int((x + 0.5).rounded(.down)) }
        return (max(1, round(Double(width) * scale)), max(1, round(Double(height) * scale)))
    }

    /// A photo ready for `coach.send`: JPEG bytes (or the original's), its media type, and the
    /// pixel size sent.
    public struct Prepared: Equatable {
        public var data: Data
        public var mediaType: String
        public var width: Int
        public var height: Int

        /// The intent's image (base64, no data: prefix).
        public var coachImage: CoachImage { CoachImage(mediaType: mediaType, data: data.base64EncodedString()) }
    }

    /// The photo in `data` (any format ImageIO reads: HEIC, JPEG, PNG…) prepared for the coach.
    /// Nil only for bytes that are neither a readable image nor one of the API's own types.
    public static func prepare(_ data: Data) -> Prepared? {
        if let out = downscale(data) { return out }
        // the page sends the original when it cannot draw it
        guard let type = mediaType(sniffing: data) else { return nil }
        return Prepared(data: data, mediaType: type, width: 0, height: 0)
    }

    static func downscale(_ data: Data) -> Prepared? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil), CGImageSourceGetCount(source) > 0,
              let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let pw = (props[kCGImagePropertyPixelWidth] as? NSNumber)?.intValue,
              let ph = (props[kCGImagePropertyPixelHeight] as? NSNumber)?.intValue, pw > 0, ph > 0 else { return nil }
        let orientation = (props[kCGImagePropertyOrientation] as? NSNumber)?.uint32Value ?? 1
        // EXIF orientations 5...8 turn the photo a quarter: its upright width is its stored height
        let quarter = (5...8).contains(orientation)
        let (uw, uh) = quarter ? (ph, pw) : (pw, ph)
        let (tw, th) = targetSize(width: uw, height: uh)
        // decode near the target size (upright), then draw it into exactly tw × th
        let thumbOptions: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: max(tw, th),
            kCGImageSourceShouldCacheImmediately: true,
        ]
        guard let upright = CGImageSourceCreateThumbnailAtIndex(source, 0, thumbOptions as CFDictionary) else { return nil }
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: tw, height: th), format: format)
        let jpeg = renderer.jpegData(withCompressionQuality: jpegQuality) { ctx in
            // a transparent PNG goes on white rather than black (JPEG has no alpha)
            UIColor.white.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: tw, height: th))
            UIImage(cgImage: upright).draw(in: CGRect(x: 0, y: 0, width: tw, height: th))
        }
        return Prepared(data: jpeg, mediaType: "image/jpeg", width: tw, height: th)
    }

    /// The API's image types by their first bytes.
    static func mediaType(sniffing d: Data) -> String? {
        let b = [UInt8](d.prefix(12))
        if b.count >= 3, b[0] == 0xFF, b[1] == 0xD8, b[2] == 0xFF { return "image/jpeg" }
        if b.count >= 8, b[0] == 0x89, b[1] == 0x50, b[2] == 0x4E, b[3] == 0x47 { return "image/png" }
        if b.count >= 6, b[0] == 0x47, b[1] == 0x49, b[2] == 0x46 { return "image/gif" }
        if b.count >= 12, b[0] == 0x52, b[1] == 0x49, b[2] == 0x46, b[3] == 0x46, b[8] == 0x57, b[9] == 0x45, b[10] == 0x42, b[11] == 0x50 { return "image/webp" }
        return nil
    }
}
#endif
