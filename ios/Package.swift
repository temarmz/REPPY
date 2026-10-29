// swift-tools-version:5.4
import PackageDescription

// The portable domain can be tested without an iOS SDK. The app uses Xcode 16+.
let package = Package(
    name: "ReppyCore",
    platforms: [.macOS(.v11)],
    products: [.library(name: "ReppyCore", targets: ["ReppyCore"])],
    targets: [
        .target(name: "ReppyCore", path: "REPPY/Core"),
        .testTarget(name: "ReppyCoreTests", dependencies: ["ReppyCore"], path: "REPPYTests", exclude: ["Fixtures"])
    ]
)
