import ImageIO
import UIKit
import UniformTypeIdentifiers

/// The share sheet's page for one photo (Photos offers the extension for exactly one image): the photo, a comment, Send.
/// Build 62:
/// - **Send waits for the photo** (S1). The arrow is dimmed, with a spinner over the preview, until the photo has loaded.
///   Its bytes are read inside the provider's handler (a file the provider hands over is there only while the handler
///   runs) and made ready there as ImageIO's thumbnail at 1600 px, as the app's CoachPhoto does: never a full-size decode
///   or draw, which a large photo would take past an extension's memory limit (a 48 MP photo decodes to about 190 MB). A
///   tap or Return during the load is remembered and sends once the photo is ready; a load that comes to nothing (no
///   image, an error, bytes no image comes from) says "Couldn't load this photo" and leaves only Cancel. Send runs once.
/// - **The words go as a file, written before the photo** (S2): `pendingShare.json` {v: 1, id, at, bytes, comment}, then
///   `pendingShare.jpg`, each atomically, in the App Group's container; the app's TrovoShare pairs them by `bytes`, and
///   the words are there as soon as the photo is (a value in the group's UserDefaults reached the app late: an iOS 27.2
///   cold share arrived without its words). Build 61's UserDefaults keys go. No container, or a write that fails, says
///   "Couldn't save this photo" and opens nothing.
/// - **The request completes once the app-open hop has answered** (S3): true closes the sheet; false, no application in
///   the responder chain, or no answer in 3 s says "Saved. Open Fitness Programmer to send it." with Done, which closes
///   it. Nothing is deleted on that path: the app reads the share at its next launch or return. A true that comes after
///   the 3 s closes the sheet too.
class ShareViewController: UIViewController {

    /// The App Group the app's TrovoShare reads from.
    static let group = "group.app.kt.trainer"
    /// The longest edge of the photo saved (the coach downsamples past it anyway).
    static let maxEdge = 1600
    /// How long the open of the app may go unanswered before the sheet says the photo is saved.
    static let openWait: TimeInterval = 3

    static let loadFailed = "Couldn\u{2019}t load this photo"
    static let saveFailed = "Couldn\u{2019}t save this photo"
    static let savedWords = "Saved. Open Fitness Programmer to send it."

    private enum Phase { case loading, ready, failed, sending, saved, done }
    private var phase: Phase = .loading
    /// The photo ready to save: a JPEG at quality 0.8, 1600 px at most.
    private var jpeg: Data?
    /// Send was asked for while the photo loaded: it goes once the photo is ready.
    private var sendAsked = false
    private var openTimer: Timer?

    private lazy var imageView: UIImageView = {
        let v = UIImageView()
        v.contentMode = .scaleAspectFit
        v.clipsToBounds = true
        v.layer.cornerRadius = 14
        v.backgroundColor = UIColor(white: 0.12, alpha: 1)
        v.isAccessibilityElement = true
        v.accessibilityLabel = "Photo to send"
        v.translatesAutoresizingMaskIntoConstraints = false
        return v
    }()

    private lazy var spinner: UIActivityIndicatorView = {
        let s = UIActivityIndicatorView(style: .large)
        s.color = .white
        s.hidesWhenStopped = true
        s.accessibilityLabel = "Loading the photo"
        s.translatesAutoresizingMaskIntoConstraints = false
        return s
    }()

    /// Over the photo while the sheet says something: the words stay readable on any photo, in either appearance.
    private lazy var scrim: UIView = {
        let v = UIView()
        v.backgroundColor = UIColor.black.withAlphaComponent(0.6)
        v.layer.cornerRadius = 14
        v.isHidden = true
        v.translatesAutoresizingMaskIntoConstraints = false
        return v
    }()

    private lazy var messageLabel: UILabel = {
        let l = UILabel()
        l.numberOfLines = 0
        l.textAlignment = .center
        l.textColor = .white
        l.font = .preferredFont(forTextStyle: .headline)
        l.adjustsFontForContentSizeCategory = true
        l.isHidden = true
        l.translatesAutoresizingMaskIntoConstraints = false
        return l
    }()

    private lazy var commentField: UITextField = {
        let f = UITextField()
        f.attributedPlaceholder = NSAttributedString(
            string: "Add comment or Send",
            attributes: [.foregroundColor: UIColor.systemGray]
        )
        f.textColor = .label
        f.font = .systemFont(ofSize: 15)
        f.returnKeyType = .send
        f.delegate = self
        f.translatesAutoresizingMaskIntoConstraints = false
        return f
    }()

    private lazy var sendBtn: UIButton = {
        let cfg = UIImage.SymbolConfiguration(pointSize: 30, weight: .regular)
        let b = UIButton(type: .system)
        b.setImage(UIImage(systemName: "arrow.up.circle.fill", withConfiguration: cfg), for: .normal)
        b.tintColor = .systemBlue
        b.accessibilityLabel = "Send"
        b.addTarget(self, action: #selector(send), for: .touchUpInside)
        b.translatesAutoresizingMaskIntoConstraints = false
        return b
    }()

    /// In Send's place once Send is asked for: while the photo still loads, and while the share is saved and the app opened.
    private lazy var sendSpinner: UIActivityIndicatorView = {
        let s = UIActivityIndicatorView(style: .medium)
        s.hidesWhenStopped = true
        s.accessibilityLabel = "Sending"
        s.translatesAutoresizingMaskIntoConstraints = false
        return s
    }()

    private lazy var inputBar = UIView()
    private lazy var cancelBtn = makeTextButton("Cancel", action: #selector(cancel))
    private lazy var doneBtn: UIButton = {
        let b = makeTextButton("Done", action: #selector(done))
        b.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        b.isHidden = true
        return b
    }()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        buildNavBar()
        view.addSubview(imageView)
        view.addSubview(scrim)
        view.addSubview(spinner)
        view.addSubview(messageLabel)
        buildInputBar()
        NSLayoutConstraint.activate([
            imageView.topAnchor.constraint(equalTo: view.topAnchor, constant: 70),
            imageView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            imageView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            imageView.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -68),

            scrim.topAnchor.constraint(equalTo: imageView.topAnchor),
            scrim.leadingAnchor.constraint(equalTo: imageView.leadingAnchor),
            scrim.trailingAnchor.constraint(equalTo: imageView.trailingAnchor),
            scrim.bottomAnchor.constraint(equalTo: imageView.bottomAnchor),

            spinner.centerXAnchor.constraint(equalTo: imageView.centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: imageView.centerYAnchor),

            messageLabel.centerYAnchor.constraint(equalTo: imageView.centerYAnchor),
            messageLabel.leadingAnchor.constraint(equalTo: imageView.leadingAnchor, constant: 24),
            messageLabel.trailingAnchor.constraint(equalTo: imageView.trailingAnchor, constant: -24),
        ])
        show(.loading)
        loadSharedImage()
    }

    private func buildNavBar() {
        let bar = UIView()
        bar.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(bar)

        bar.addSubview(cancelBtn)
        bar.addSubview(doneBtn)

        let icon = UIImageView(image: UIImage(systemName: "figure.strengthtraining.traditional"))
        icon.tintColor = UIColor(red: 0.85, green: 1.0, blue: 0.39, alpha: 1)   // Supero lime
        icon.translatesAutoresizingMaskIntoConstraints = false
        bar.addSubview(icon)

        let title = UILabel()
        title.text = "Fitness Programmer"
        title.font = .systemFont(ofSize: 17, weight: .semibold)
        title.translatesAutoresizingMaskIntoConstraints = false
        bar.addSubview(title)

        let titleStack = UIStackView(arrangedSubviews: [icon, title])
        titleStack.axis = .horizontal
        titleStack.spacing = 5
        titleStack.alignment = .center
        titleStack.translatesAutoresizingMaskIntoConstraints = false
        bar.addSubview(titleStack)

        let sep = hairline()
        bar.addSubview(sep)

        NSLayoutConstraint.activate([
            bar.topAnchor.constraint(equalTo: view.topAnchor),
            bar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bar.heightAnchor.constraint(equalToConstant: 54),

            cancelBtn.leadingAnchor.constraint(equalTo: bar.leadingAnchor, constant: 16),
            cancelBtn.centerYAnchor.constraint(equalTo: bar.centerYAnchor),

            doneBtn.trailingAnchor.constraint(equalTo: bar.trailingAnchor, constant: -16),
            doneBtn.centerYAnchor.constraint(equalTo: bar.centerYAnchor),

            titleStack.centerXAnchor.constraint(equalTo: bar.centerXAnchor),
            titleStack.centerYAnchor.constraint(equalTo: bar.centerYAnchor),
            icon.widthAnchor.constraint(equalToConstant: 20),
            icon.heightAnchor.constraint(equalToConstant: 20),

            sep.bottomAnchor.constraint(equalTo: bar.bottomAnchor),
            sep.leadingAnchor.constraint(equalTo: bar.leadingAnchor),
            sep.trailingAnchor.constraint(equalTo: bar.trailingAnchor),
            sep.heightAnchor.constraint(equalToConstant: 0.5),
        ])
    }

    private func buildInputBar() {
        let bar = inputBar
        bar.backgroundColor = .systemBackground
        bar.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(bar)

        let sep = hairline()
        bar.addSubview(sep)

        let pill = UIView()
        pill.backgroundColor = .secondarySystemBackground
        pill.layer.cornerRadius = 18
        pill.translatesAutoresizingMaskIntoConstraints = false
        bar.addSubview(pill)
        pill.addSubview(commentField)

        bar.addSubview(sendBtn)
        bar.addSubview(sendSpinner)

        NSLayoutConstraint.activate([
            bar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bar.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor),
            bar.heightAnchor.constraint(equalToConstant: 60),

            sep.topAnchor.constraint(equalTo: bar.topAnchor),
            sep.leadingAnchor.constraint(equalTo: bar.leadingAnchor),
            sep.trailingAnchor.constraint(equalTo: bar.trailingAnchor),
            sep.heightAnchor.constraint(equalToConstant: 0.5),

            pill.leadingAnchor.constraint(equalTo: bar.leadingAnchor, constant: 16),
            pill.trailingAnchor.constraint(equalTo: sendBtn.leadingAnchor, constant: -8),
            pill.centerYAnchor.constraint(equalTo: bar.centerYAnchor),
            pill.heightAnchor.constraint(equalToConstant: 36),

            commentField.leadingAnchor.constraint(equalTo: pill.leadingAnchor, constant: 14),
            commentField.trailingAnchor.constraint(equalTo: pill.trailingAnchor, constant: -14),
            commentField.centerYAnchor.constraint(equalTo: pill.centerYAnchor),

            sendBtn.trailingAnchor.constraint(equalTo: bar.trailingAnchor, constant: -12),
            sendBtn.centerYAnchor.constraint(equalTo: bar.centerYAnchor),
            sendBtn.widthAnchor.constraint(equalToConstant: 34),
            sendBtn.heightAnchor.constraint(equalToConstant: 34),

            sendSpinner.centerXAnchor.constraint(equalTo: sendBtn.centerXAnchor),
            sendSpinner.centerYAnchor.constraint(equalTo: sendBtn.centerYAnchor),
        ])
    }

    // MARK: The photo

    /// The first image the share holds, loaded once. Its handler runs on the provider's queue: the photo is made ready
    /// there, while a file the provider hands over is still there to read.
    private func loadSharedImage() {
        let typeId = UTType.image.identifier
        let items = extensionContext?.inputItems as? [NSExtensionItem] ?? []
        guard let provider = items.lazy.flatMap({ $0.attachments ?? [] }).first(where: { $0.hasItemConformingToTypeIdentifier(typeId) }) else {
            return photoLoaded(nil)
        }
        provider.loadItem(forTypeIdentifier: typeId, options: nil) { [weak self] item, error in
            let ready = error == nil ? Self.prepare(item) : nil
            DispatchQueue.main.async { self?.photoLoaded(ready) }
        }
    }

    private func photoLoaded(_ ready: (jpeg: Data, preview: UIImage)?) {
        guard phase == .loading else { return }   // cancelled meanwhile
        guard let ready else {
            show(.failed, words: Self.loadFailed)
            return
        }
        jpeg = ready.jpeg
        imageView.image = ready.preview
        show(.ready)
        if sendAsked { send() }
    }

    /// What the provider handed over, made ready to save: a file or bytes through ImageIO's thumbnail (decoded near
    /// 1600 px, upright), an image already in memory drawn down to 1600 px. Nil when no image comes of it.
    static func prepare(_ item: NSSecureCoding?) -> (jpeg: Data, preview: UIImage)? {
        switch item {
        case let url as URL:
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
            return thumbnail(source)
        case let data as Data:
            guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
            return thumbnail(source)
        case let image as UIImage:
            return drawnDown(image)
        default:
            return nil
        }
    }

    /// The photo decoded at 1600 px at most on its long edge, its orientation applied (CoachPhoto.downscale's options).
    static func thumbnail(_ source: CGImageSource) -> (jpeg: Data, preview: UIImage)? {
        guard CGImageSourceGetCount(source) > 0 else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxEdge,
            kCGImageSourceShouldCacheImmediately: true,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        return encoded(image)
    }

    /// An image the provider handed over already decoded (a screenshot from the markup editor): drawn at 1600 px at most.
    static func drawnDown(_ image: UIImage) -> (jpeg: Data, preview: UIImage)? {
        let pw = image.size.width * image.scale, ph = image.size.height * image.scale
        guard pw > 0, ph > 0 else { return nil }
        let k = min(1, CGFloat(maxEdge) / max(pw, ph))
        let size = CGSize(width: max(1, (pw * k).rounded()), height: max(1, (ph * k).rounded()))
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let drawn = UIGraphicsImageRenderer(size: size, format: format).image { ctx in
            UIColor.white.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        guard let cg = drawn.cgImage else { return nil }
        return encoded(cg)
    }

    /// The image as a JPEG at quality 0.8 (a photo with transparency on white: JPEG has none), with its preview.
    static func encoded(_ image: CGImage) -> (jpeg: Data, preview: UIImage)? {
        var flat = image
        switch image.alphaInfo {
        case .none, .noneSkipFirst, .noneSkipLast:
            break
        default:
            let space = image.colorSpace.flatMap { $0.model == .rgb ? $0 : nil } ?? CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB()
            let rect = CGRect(x: 0, y: 0, width: image.width, height: image.height)
            guard let ctx = CGContext(data: nil, width: image.width, height: image.height, bitsPerComponent: 8, bytesPerRow: 0,
                                      space: space, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
            ctx.setFillColor(UIColor.white.cgColor)
            ctx.fill(rect)
            ctx.draw(image, in: rect)
            guard let made = ctx.makeImage() else { return nil }
            flat = made
        }
        let out = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(out, UTType.jpeg.identifier as CFString, 1, nil) else { return nil }
        CGImageDestinationAddImage(dest, flat, [kCGImageDestinationLossyCompressionQuality: 0.8] as CFDictionary)
        guard CGImageDestinationFinalize(dest), out.length > 0 else { return nil }
        return (out as Data, UIImage(cgImage: flat))
    }

    // MARK: Send

    @objc private func cancel() {
        finish()
    }

    @objc private func done() {
        finish()
    }

    /// The arrow and Return. While the photo loads it is remembered; once ready it runs once.
    @objc private func send() {
        switch phase {
        case .loading:
            sendAsked = true
            sendBtn.isHidden = true
            sendSpinner.startAnimating()
            return
        case .ready:
            break
        case .failed, .sending, .saved, .done:
            return
        }
        guard let jpeg else { return }
        show(.sending)
        guard save(jpeg, comment: commentField.text ?? "") else {
            show(.failed, words: Self.saveFailed)
            return
        }
        openTimer = Timer.scheduledTimer(withTimeInterval: Self.openWait, repeats: false) { [weak self] _ in self?.opened(nil) }
        openTrovo { [weak self] ok in self?.opened(ok) }
    }

    /// The share as the app reads it: the words file, then the photo, each atomically; build 61's UserDefaults keys
    /// removed. False with no container or a write that fails.
    private func save(_ jpeg: Data, comment: String) -> Bool {
        guard let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Self.group) else { return false }
        let words: [String: Any] = ["v": 1, "id": UUID().uuidString, "at": Int64((Date().timeIntervalSince1970 * 1000).rounded()),
                                    "bytes": jpeg.count, "comment": comment]
        do {
            try JSONSerialization.data(withJSONObject: words).write(to: dir.appendingPathComponent("pendingShare.json"), options: .atomic)
            try jpeg.write(to: dir.appendingPathComponent("pendingShare.jpg"), options: .atomic)
        } catch {
            return false
        }
        if let defaults = UserDefaults(suiteName: Self.group) {
            defaults.removeObject(forKey: "pendingShareImage")     // the base64 slot of builds before 41
            defaults.removeObject(forKey: "pendingShareComment")   // build 61's words
            defaults.synchronize()
        }
        return true
    }

    /// The open's answer (nil: none in 3 s). True closes the sheet, whenever it comes; anything else while the sheet waits
    /// says the photo is saved, with Done.
    private func opened(_ ok: Bool?) {
        openTimer?.invalidate()
        openTimer = nil
        if ok == true { return finish() }
        guard phase == .sending else { return }
        show(.saved, words: Self.savedWords)
    }

    /// Opens the app at trovo://share through the responder chain's application, answering whether iOS opened it (false
    /// when there is no application in the chain).
    private func openTrovo(_ done: @escaping (Bool) -> Void) {
        guard let url = URL(string: "trovo://share") else { return done(false) }
        var responder: UIResponder? = self
        while let r = responder {
            if let app = r as? UIApplication {
                app.open(url, options: [:]) { ok in DispatchQueue.main.async { done(ok) } }
                return
            }
            responder = r.next
        }
        done(false)
    }

    private func finish() {
        guard phase != .done else { return }
        phase = .done
        openTimer?.invalidate()
        openTimer = nil
        extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }

    // MARK: The sheet's states

    private func show(_ next: Phase, words: String? = nil) {
        phase = next
        switch next {
        case .loading:
            spinner.startAnimating()
            sendBtn.alpha = 0.35   // dimmed, yet a tap is remembered
            sendBtn.accessibilityHint = "Sends once the photo has loaded"
        case .ready:
            spinner.stopAnimating()
            sendBtn.alpha = 1
            sendBtn.accessibilityHint = nil
        case .sending:
            sendBtn.isHidden = true
            sendSpinner.startAnimating()
            commentField.isEnabled = false
            cancelBtn.isEnabled = false
        case .failed, .saved:
            spinner.stopAnimating()
            sendSpinner.stopAnimating()
            commentField.resignFirstResponder()
            inputBar.isHidden = true
            scrim.isHidden = false
            messageLabel.text = words
            messageLabel.isHidden = false
            cancelBtn.isEnabled = true
            cancelBtn.isHidden = next == .saved
            doneBtn.isHidden = next != .saved
            UIAccessibility.post(notification: .screenChanged, argument: messageLabel)
        case .done:
            break
        }
    }

    private func makeTextButton(_ title: String, action: Selector) -> UIButton {
        let btn = UIButton(type: .system)
        btn.setTitle(title, for: .normal)
        btn.translatesAutoresizingMaskIntoConstraints = false
        btn.addTarget(self, action: action, for: .touchUpInside)
        return btn
    }

    private func hairline() -> UIView {
        let v = UIView()
        v.backgroundColor = .separator
        v.translatesAutoresizingMaskIntoConstraints = false
        return v
    }
}

extension ShareViewController: UITextFieldDelegate {
    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        send()
        return false
    }
}
