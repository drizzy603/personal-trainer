#if os(iOS)
import UIKit

/// How a native screen comes in over the page and goes again (plan task C5; decision.md section 7): a push-like slide
/// from the trailing edge, the page dimmed a little under it, and out the same way; the way out can follow the owner's
/// finger from the leading edge (the interactive edge-pan back, as a navigation stack's). With Reduce Motion on, a
/// cross-fade instead.
///
/// Only for `.overFullScreen` presentations: the page's web view stays in its window under the screen (a `.fullScreen`
/// presentation takes the presenting view out, so the page goes hidden and runs its leave and return path).
@MainActor
final class ScreenSlideTransition: NSObject, UIViewControllerTransitioningDelegate {
    /// Drives the next dismissal when the owner's finger does (set by ScreenHost's edge pan, cleared after).
    var interaction: UIPercentDrivenInteractiveTransition?
    /// Called when a transition ends: presenting or not, and whether it completed (an interactive dismissal the owner
    /// let go of early does not).
    var ended: ((_ presenting: Bool, _ completed: Bool) -> Void)?

    func animationController(forPresented presented: UIViewController, presenting: UIViewController,
                             source: UIViewController) -> UIViewControllerAnimatedTransitioning? {
        SlideAnimator(presenting: true, owner: self)
    }

    func animationController(forDismissed dismissed: UIViewController) -> UIViewControllerAnimatedTransitioning? {
        SlideAnimator(presenting: false, owner: self)
    }

    func interactionControllerForDismissal(using animator: UIViewControllerAnimatedTransitioning) -> UIViewControllerInteractiveTransitioning? {
        interaction
    }
}

/// The dim laid over the page while a screen covers it.
final class SlideDimView: UIView {}

final class SlideAnimator: NSObject, UIViewControllerAnimatedTransitioning {
    static let duration: TimeInterval = 0.38
    /// The page under a screen, dimmed as a navigation push dims the screen it leaves.
    static let dim: CGFloat = 0.14

    let presenting: Bool
    weak var owner: ScreenSlideTransition?

    init(presenting: Bool, owner: ScreenSlideTransition) {
        self.presenting = presenting
        self.owner = owner
    }

    func transitionDuration(using ctx: UIViewControllerContextTransitioning?) -> TimeInterval {
        UIAccessibility.isReduceMotionEnabled ? 0.25 : Self.duration
    }

    func animateTransition(using ctx: UIViewControllerContextTransitioning) {
        let container = ctx.containerView
        let fade = UIAccessibility.isReduceMotionEnabled
        let width = container.bounds.width
        let duration = transitionDuration(using: ctx)
        if presenting {
            guard let toVC = ctx.viewController(forKey: .to) else {
                ctx.completeTransition(false)
                return
            }
            let to: UIView = ctx.view(forKey: .to) ?? toVC.view
            let dim = SlideDimView(frame: container.bounds)
            dim.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            dim.backgroundColor = UIColor.black.withAlphaComponent(Self.dim)
            dim.alpha = 0
            dim.isUserInteractionEnabled = false
            container.addSubview(dim)
            to.frame = ctx.finalFrame(for: toVC)
            container.addSubview(to)
            to.layer.shadowColor = UIColor.black.cgColor
            to.layer.shadowOpacity = fade ? 0 : 0.18
            to.layer.shadowRadius = 10
            to.layer.shadowOffset = CGSize(width: -2, height: 0)
            if fade { to.alpha = 0 } else { to.transform = CGAffineTransform(translationX: width, y: 0) }
            UIView.animate(withDuration: duration, delay: 0, usingSpringWithDamping: 1, initialSpringVelocity: 0,
                           options: [.curveEaseOut, .allowUserInteraction]) {
                to.transform = .identity
                to.alpha = 1
                dim.alpha = 1
            } completion: { _ in
                let ok = !ctx.transitionWasCancelled
                to.layer.shadowOpacity = 0
                if !ok {
                    to.removeFromSuperview()
                    dim.removeFromSuperview()
                }
                ctx.completeTransition(ok)
            }
        } else {
            guard let fromVC = ctx.viewController(forKey: .from) else {
                ctx.completeTransition(false)
                return
            }
            let from: UIView = ctx.view(forKey: .from) ?? fromVC.view
            let dim = container.subviews.first { $0 is SlideDimView }
            let interactive = ctx.isInteractive
            from.layer.shadowColor = UIColor.black.cgColor
            from.layer.shadowOpacity = fade ? 0 : 0.18
            from.layer.shadowRadius = 10
            from.layer.shadowOffset = CGSize(width: -2, height: 0)
            UIView.animate(withDuration: duration, delay: 0, options: interactive ? [.curveLinear] : [.curveEaseInOut]) {
                if fade { from.alpha = 0 } else { from.transform = CGAffineTransform(translationX: width, y: 0) }
                dim?.alpha = 0
            } completion: { _ in
                let ok = !ctx.transitionWasCancelled
                from.layer.shadowOpacity = 0
                if ok {
                    dim?.removeFromSuperview()
                } else {
                    from.transform = .identity
                    from.alpha = 1
                    dim?.alpha = 1
                }
                ctx.completeTransition(ok)
            }
        }
    }

    func animationEnded(_ transitionCompleted: Bool) {
        let presenting = self.presenting
        let owner = self.owner
        MainActor.assumeIsolated { owner?.ended?(presenting, transitionCompleted) }
    }
}
#endif
