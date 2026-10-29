import SwiftUI
import AVFoundation
import UniformTypeIdentifiers

struct VideoRecorder: UIViewControllerRepresentable {
    var onFinish: (URL?) -> Void
    static var available: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }
    func makeCoordinator() -> Coordinator { Coordinator(onFinish: onFinish) }
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera; picker.mediaTypes = [UTType.movie.identifier]
        picker.cameraCaptureMode = .video; picker.videoQuality = .typeHigh; picker.delegate = context.coordinator
        return picker
    }
    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}
    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onFinish: (URL?) -> Void
        init(onFinish: @escaping (URL?) -> Void) { self.onFinish = onFinish }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { onFinish(nil) }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            onFinish(info[.mediaURL] as? URL)
        }
    }
    static func requestAccess() async -> Bool {
        let camera = await AVCaptureDevice.requestAccess(for: .video)
        let audio = await AVCaptureDevice.requestAccess(for: .audio)
        return camera && audio
    }
}
