import UIKit
import UniformTypeIdentifiers

class ShareViewController: UIViewController {

    private var pendingImage: UIImage?

    private lazy var imageView: UIImageView = {
        let v = UIImageView()
        v.contentMode = .scaleAspectFit
        v.clipsToBounds = true
        v.layer.cornerRadius = 14
        v.backgroundColor = UIColor(white: 0.12, alpha: 1)
        v.translatesAutoresizingMaskIntoConstraints = false
        return v
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

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        buildNavBar()
        view.addSubview(imageView)
        buildInputBar()
        NSLayoutConstraint.activate([
            imageView.topAnchor.constraint(equalTo: view.topAnchor, constant: 70),
            imageView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            imageView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            imageView.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -68),
        ])
        loadSharedImage()
    }

    private func buildNavBar() {
        let bar = UIView()
        bar.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(bar)

        let cancelBtn = makeTextButton("Cancel", action: #selector(cancel))
        bar.addSubview(cancelBtn)

        let icon = UIImageView(image: UIImage(systemName: "figure.strengthtraining.traditional"))
        icon.tintColor = .systemGreen
        icon.translatesAutoresizingMaskIntoConstraints = false
        bar.addSubview(icon)

        let title = UILabel()
        title.text = "Trovo"
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
        let bar = UIView()
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

        let cfg = UIImage.SymbolConfiguration(pointSize: 30, weight: .regular)
        let sendBtn = UIButton(type: .system)
        sendBtn.setImage(UIImage(systemName: "arrow.up.circle.fill", withConfiguration: cfg), for: .normal)
        sendBtn.tintColor = .systemBlue
        sendBtn.addTarget(self, action: #selector(send), for: .touchUpInside)
        sendBtn.translatesAutoresizingMaskIntoConstraints = false
        bar.addSubview(sendBtn)

        NSLayoutConstraint.activate([
            bar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bar.bottomAnchor.constraint(equalTo: view.bottomAnchor),
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
        ])
    }

    private func loadSharedImage() {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else { return }
        for item in items {
            for provider in item.attachments ?? [] {
                let typeId: String
                if #available(iOS 14, *) { typeId = UTType.image.identifier }
                else { typeId = "public.image" }
                guard provider.hasItemConformingToTypeIdentifier(typeId) else { continue }
                provider.loadItem(forTypeIdentifier: typeId, options: nil) { [weak self] data, _ in
                    DispatchQueue.main.async {
                        var img: UIImage?
                        switch data {
                        case let image as UIImage: img = image
                        case let url as URL:       img = UIImage(contentsOfFile: url.path)
                        case let raw as Data:      img = UIImage(data: raw)
                        default: break
                        }
                        self?.pendingImage = img
                        self?.imageView.image = img
                    }
                }
                return
            }
        }
    }

    @objc private func cancel() {
        extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }

    @objc private func send() {
        guard let image = pendingImage,
              let jpeg = image.jpegData(compressionQuality: 0.75) else {
            extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
            return
        }
        if let defaults = UserDefaults(suiteName: "group.app.kt.trainer") {
            defaults.set(jpeg.base64EncodedString(), forKey: "pendingShareImage")
            defaults.set(commentField.text ?? "", forKey: "pendingShareComment")
            defaults.synchronize()
        }
        openTrovo()
        extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }

    private func openTrovo() {
        guard let url = URL(string: "trovo://share") else { return }
        var responder: UIResponder? = self
        while let r = responder {
            if let app = r as? UIApplication {
                app.open(url, options: [:], completionHandler: nil)
                return
            }
            responder = r.next
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
