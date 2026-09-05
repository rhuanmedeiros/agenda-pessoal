import SwiftUI
import WebKit

struct WebViewContainer: UIViewRepresentable {
    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> WKWebView {
        let contentController = WKUserContentController()
        contentController.add(context.coordinator, name: "nativeHaptic")

        let config = WKWebViewConfiguration()
        config.userContentController = contentController
        config.allowsInlineMediaPlayback = true
        config.defaultWebpagePreferences.allowsContentJavaScript = true

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.isOpaque = false
        
        // Match dark theme background #121413 to prevent white flashing
        let appBgColor = UIColor(red: 18/255.0, green: 20/255.0, blue: 19/255.0, alpha: 1.0)
        webView.backgroundColor = appBgColor
        webView.scrollView.backgroundColor = appBgColor
        
        // Enable CSS safe-area insets handling
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.bounces = false

        context.coordinator.loadWebApp(in: webView)
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        func loadWebApp(in webView: WKWebView) {
            // Check for WebApp directory first, fallback to main bundle root
            if let webAppDir = Bundle.main.url(forResource: "WebApp", withExtension: nil),
               let indexUrl = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "WebApp") {
                webView.loadFileURL(indexUrl, allowingReadAccessTo: webAppDir)
                return
            }
            
            if let indexUrl = Bundle.main.url(forResource: "index", withExtension: "html") {
                let baseDir = indexUrl.deletingLastPathComponent()
                webView.loadFileURL(indexUrl, allowingReadAccessTo: baseDir)
            }
        }

        // Handle native Haptic Feedback triggered from JavaScript
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "nativeHaptic", let type = message.body as? String else { return }
            
            DispatchQueue.main.async {
                switch type {
                case "light":
                    let generator = UIImpactFeedbackGenerator(style: .light)
                    generator.impactOccurred()
                case "medium":
                    let generator = UIImpactFeedbackGenerator(style: .medium)
                    generator.impactOccurred()
                case "heavy":
                    let generator = UIImpactFeedbackGenerator(style: .heavy)
                    generator.impactOccurred()
                case "selection":
                    let generator = UISelectionFeedbackGenerator()
                    generator.selectionChanged()
                case "success":
                    let generator = UINotificationFeedbackGenerator()
                    generator.notificationOccurred(.success)
                case "warning":
                    let generator = UINotificationFeedbackGenerator()
                    generator.notificationOccurred(.warning)
                case "error":
                    let generator = UINotificationFeedbackGenerator()
                    generator.notificationOccurred(.error)
                default:
                    let generator = UIImpactFeedbackGenerator(style: .light)
                    generator.impactOccurred()
                }
            }
        }

        // Open external links in Safari
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if navigationAction.navigationType == .linkActivated,
               let url = navigationAction.request.url,
               url.scheme == "http" || url.scheme == "https" {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }
    }
}
