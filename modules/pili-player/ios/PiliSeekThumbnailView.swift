// Copyright 2026 PiliPlus. All rights reserved.

import ExpoModulesCore
import QuartzCore
import UIKit

/// Shared image ref used to hand a decoded seek frame directly to the native preview layer.
final class PiliSeekThumbnailImage: SharedRef<UIImage> {
    override var nativeRefType: String {
        "image"
    }

    override func getAdditionalMemoryPressure() -> Int {
        guard let cgImage = ref.cgImage else {
            return 0
        }
        return cgImage.bytesPerRow * cgImage.height
    }
}

public final class PiliSeekThumbnailView: ExpoView {
    private let imageLayer = CALayer()

    public required init(appContext: AppContext? = nil) {
        super.init(appContext: appContext)
        clipsToBounds = true
        backgroundColor = .clear
        isUserInteractionEnabled = false
        imageLayer.contentsGravity = .resizeAspectFill
        imageLayer.magnificationFilter = .linear
        imageLayer.minificationFilter = .linear
        layer.addSublayer(imageLayer)
    }

    public override func layoutSubviews() {
        super.layoutSubviews()
        imageLayer.frame = bounds
    }

    func setImage(_ image: SharedRef<UIImage>?) {
        imageLayer.contents = image?.ref.cgImage
        imageLayer.contentsScale = image?.ref.scale ?? UIScreen.main.scale
    }
}
