import Foundation
import Capacitor
import Speech
import AVFoundation

// One-shot dictation for hands-free set logging: start on call, finish after
// ~1.6 s of silence (or 8 s cap), resolve {text}. Errors resolve {text:""}
// with a reason so the JS side can fall back to manual entry quietly.
@objc(TrovoSpeechPlugin)
public class TrovoSpeechPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TrovoSpeechPlugin"
    public let jsName = "TrovoSpeech"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "dictate", returnType: CAPPluginReturnPromise),
    ]

    private let audioEngine = AVAudioEngine()
    private var recognizer: SFSpeechRecognizer? = SFSpeechRecognizer()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var silenceTimer: Timer?
    private var capTimer: Timer?
    private var lastText = ""
    private var activeCall: CAPPluginCall?

    @objc func dictate(_ call: CAPPluginCall) {
        SFSpeechRecognizer.requestAuthorization { [weak self] auth in
            guard let self = self else { return }
            guard auth == .authorized else {
                DispatchQueue.main.async { call.resolve(["text": "", "reason": "speech-denied"]) }
                return
            }
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                DispatchQueue.main.async {
                    guard granted else { call.resolve(["text": "", "reason": "mic-denied"]); return }
                    self.begin(call)
                }
            }
        }
    }

    private func begin(_ call: CAPPluginCall) {
        finishActive(resolve: false)
        guard let recognizer = recognizer, recognizer.isAvailable else {
            call.resolve(["text": "", "reason": "unavailable"])
            return
        }
        activeCall = call
        lastText = ""
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)
            let req = SFSpeechAudioBufferRecognitionRequest()
            req.shouldReportPartialResults = true
            request = req
            let input = audioEngine.inputNode
            let format = input.outputFormat(forBus: 0)
            input.removeTap(onBus: 0)
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
                req.append(buffer)
            }
            audioEngine.prepare()
            try audioEngine.start()
            task = recognizer.recognitionTask(with: req) { [weak self] result, error in
                guard let self = self else { return }
                if let result = result {
                    let text = result.bestTranscription.formattedString
                    if text != self.lastText {
                        self.lastText = text
                        DispatchQueue.main.async { self.armSilenceTimer() }
                    }
                    if result.isFinal { DispatchQueue.main.async { self.finishActive(resolve: true) } }
                }
                if error != nil { DispatchQueue.main.async { self.finishActive(resolve: true) } }
            }
            armSilenceTimer()
            capTimer = Timer.scheduledTimer(withTimeInterval: 8.0, repeats: false) { [weak self] _ in
                self?.finishActive(resolve: true)
            }
        } catch {
            call.resolve(["text": "", "reason": "audio-failed"])
            activeCall = nil
        }
    }

    private func armSilenceTimer() {
        silenceTimer?.invalidate()
        silenceTimer = Timer.scheduledTimer(withTimeInterval: 1.6, repeats: false) { [weak self] _ in
            self?.finishActive(resolve: true)
        }
    }

    private func finishActive(resolve: Bool) {
        silenceTimer?.invalidate(); silenceTimer = nil
        capTimer?.invalidate(); capTimer = nil
        if audioEngine.isRunning {
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }
        request?.endAudio(); request = nil
        task?.cancel(); task = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        if resolve, let call = activeCall {
            call.resolve(["text": lastText])
        }
        activeCall = nil
    }
}
