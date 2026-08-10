// Copyright 2026 PiliPlus. All rights reserved.

import ExpoModulesCore
import SDWebImage
import UIKit

public final class PiliImageViewer: ExpoView {
    private let backgroundView = UIView()
    private let pageScrollView = UIScrollView()
    private let closeButton = UIButton(type: .system)
    private let counterLabel = UILabel()
    private let prevButton = UIButton(type: .system)
    private let nextButton = UIButton(type: .system)

    private var imageURLs: [String] = []
    private var pageViews: [Int: ImagePageScrollView] = [:]
    private var currentIndex = 0
    private var isVisible = false
    private var contextMenuEnabled = true

    let onClose = EventDispatcher()
    let onIndexChange = EventDispatcher()

    public required init(appContext: AppContext? = nil) {
        super.init(appContext: appContext)
        backgroundColor = .black
        isHidden = true
        configureSubviews()
    }

    // MARK: - Props

    func setImages(_ urls: [String]) {
        guard imageURLs != urls else {
            return
        }
        imageURLs = urls
        currentIndex = min(max(currentIndex, 0), max(urls.count - 1, 0))
        rebuildPages()
        updateCounter()
        setNeedsLayout()
        if isVisible {
            scrollToCurrentPage(animated: false)
            loadVisiblePages()
        }
    }

    func setInitialIndex(_ index: Int) {
        let target = min(max(index, 0), max(imageURLs.count - 1, 0))
        guard target != currentIndex else {
            return
        }
        currentIndex = target
        updateCounter()
        emitIndexChange()
        if isVisible {
            scrollToCurrentPage(animated: false)
            loadVisiblePages()
        }
    }

    func setVisible(_ visible: Bool) {
        isVisible = visible
        isHidden = !visible || imageURLs.isEmpty

        if visible {
            backgroundView.alpha = 1
            pageScrollView.transform = .identity
            for page in pageViews.values {
                page.resetZoom()
            }
            scrollToCurrentPage(animated: false)
            loadVisiblePages()
        } else {
            pageScrollView.transform = .identity
            for page in pageViews.values {
                page.unloadImage()
            }
        }
    }

    func setContextMenuEnabled(_ enabled: Bool) {
        contextMenuEnabled = enabled
        for page in pageViews.values {
            page.isContextMenuEnabled = enabled
        }
    }

    // MARK: - Layout

    public override func layoutSubviews() {
        super.layoutSubviews()
        backgroundView.frame = bounds
        pageScrollView.frame = bounds
        layoutPages()
        positionControls()
        updateCounter()
    }

    private func layoutPages() {
        let size = bounds.size
        guard size.width > 0, size.height > 0 else {
            return
        }

        pageScrollView.contentSize = CGSize(
            width: size.width * CGFloat(max(imageURLs.count, 1)),
            height: size.height
        )

        for (index, page) in pageViews {
            page.frame = CGRect(
                x: size.width * CGFloat(index),
                y: 0,
                width: size.width,
                height: size.height
            )
        }

        pageScrollView.isScrollEnabled = imageURLs.count > 1
        scrollToCurrentPage(animated: false)
    }

    private func positionControls() {
        let margin: CGFloat = 16
        let top = safeAreaInsets.top + 10
        let bottom = bounds.height - safeAreaInsets.bottom - 28
        let buttonSize = CGSize(width: 40, height: 40)

        closeButton.frame = CGRect(origin: CGPoint(x: margin, y: top), size: buttonSize)
        counterLabel.frame = CGRect(
            x: (bounds.width - 90) / 2,
            y: top + 6,
            width: 90,
            height: 28
        )
        prevButton.frame = CGRect(origin: CGPoint(x: bounds.midX - buttonSize.width - 20, y: bottom), size: buttonSize)
        nextButton.frame = CGRect(origin: CGPoint(x: bounds.midX + 20, y: bottom), size: buttonSize)
    }

    // MARK: - Setup

    private func configureSubviews() {
        backgroundView.backgroundColor = .black
        backgroundView.frame = bounds
        addSubview(backgroundView)

        pageScrollView.isPagingEnabled = true
        pageScrollView.showsHorizontalScrollIndicator = false
        pageScrollView.showsVerticalScrollIndicator = false
        pageScrollView.backgroundColor = .clear
        pageScrollView.delegate = self
        addSubview(pageScrollView)

        configureButton(closeButton, symbol: "xmark", action: #selector(closeTapped))
        closeButton.accessibilityLabel = "关闭"
        addSubview(closeButton)

        configureButton(prevButton, symbol: "chevron.left", action: #selector(prevTapped))
        prevButton.accessibilityLabel = "上一张"
        addSubview(prevButton)

        configureButton(nextButton, symbol: "chevron.right", action: #selector(nextTapped))
        nextButton.accessibilityLabel = "下一张"
        addSubview(nextButton)

        counterLabel.textColor = .white
        counterLabel.font = .systemFont(ofSize: 13, weight: .semibold)
        counterLabel.textAlignment = .center
        counterLabel.backgroundColor = UIColor.black.withAlphaComponent(0.45)
        counterLabel.layer.cornerRadius = 14
        counterLabel.layer.masksToBounds = true
        addSubview(counterLabel)
    }

    private func configureButton(_ button: UIButton, symbol: String, action: Selector) {
        let image = UIImage(systemName: symbol)?
            .withConfiguration(UIImage.SymbolConfiguration(pointSize: 18, weight: .semibold))
        button.setImage(image, for: .normal)
        button.tintColor = .white
        button.backgroundColor = UIColor.black.withAlphaComponent(0.45)
        button.layer.cornerRadius = 20
        button.layer.cornerCurve = .continuous
        button.addTarget(self, action: action, for: .touchUpInside)
    }

    private func rebuildPages() {
        for page in pageViews.values {
            page.cancelImageLoad()
            page.removeFromSuperview()
        }
        pageViews.removeAll()
    }

    private func loadVisiblePages() {
        let candidates = [currentIndex - 1, currentIndex, currentIndex + 1]
        for index in candidates where imageURLs.indices.contains(index) {
            ensurePage(at: index)?.loadImage(urlString: imageURLs[index])
        }
        unloadFarPages()
    }

    private func unloadFarPages() {
        for (index, page) in pageViews where abs(index - currentIndex) > 1 {
            page.unloadImage()
        }
    }

    @discardableResult
    private func ensurePage(at index: Int) -> ImagePageScrollView? {
        guard imageURLs.indices.contains(index) else {
            return nil
        }
        if let page = pageViews[index] {
            return page
        }
        let page = ImagePageScrollView()
        page.isContextMenuEnabled = contextMenuEnabled
        page.onDismissPan = { [weak self] translation, velocity, ended in
            self?.handleDismissPan(translation: translation, velocity: velocity, ended: ended)
        }
        pageScrollView.addSubview(page)
        pageViews[index] = page
        if bounds.width > 0 {
            page.frame = CGRect(
                x: bounds.width * CGFloat(index),
                y: 0,
                width: bounds.width,
                height: bounds.height
            )
        }
        return page
    }

    private func scrollToCurrentPage(animated: Bool) {
        let x = bounds.width * CGFloat(currentIndex)
        pageScrollView.setContentOffset(CGPoint(x: x, y: 0), animated: animated)
    }

    private func updateCounter() {
        let hasMultiple = imageURLs.count > 1
        counterLabel.isHidden = !hasMultiple
        prevButton.isHidden = !hasMultiple
        nextButton.isHidden = !hasMultiple
        counterLabel.text = "\(currentIndex + 1) / \(max(imageURLs.count, 1))"
    }

    private func emitIndexChange() {
        onIndexChange(["index": currentIndex])
    }

    private func currentZoomIsMinimal() -> Bool {
        guard let page = pageViews[currentIndex] else {
            return true
        }
        return page.zoomScale <= 1.01
    }

    private func handleDismissPan(translation: CGFloat, velocity: CGFloat, ended: Bool) {
        guard currentZoomIsMinimal() else {
            return
        }

        if ended {
            let shouldDismiss = translation > 120 || velocity > 900
            if shouldDismiss {
                UIView.animate(
                    withDuration: 0.22,
                    animations: {
                        self.pageScrollView.transform = CGAffineTransform(
                            translationX: 0,
                            y: self.bounds.height * 0.9
                        )
                        self.backgroundView.alpha = 0
                    },
                    completion: { _ in
                        self.onClose()
                    }
                )
            } else {
                UIView.animate(
                    withDuration: 0.28,
                    delay: 0,
                    usingSpringWithDamping: 0.9,
                    initialSpringVelocity: 0,
                    options: .curveEaseOut,
                    animations: {
                        self.pageScrollView.transform = .identity
                        self.backgroundView.alpha = 1
                    }
                )
            }
        } else {
            pageScrollView.transform = CGAffineTransform(translationX: 0, y: translation)
            backgroundView.alpha = max(0, 1 - translation / 240)
        }
    }

    private func move(by delta: Int) {
        let target = min(max(currentIndex + delta, 0), max(imageURLs.count - 1, 0))
        guard target != currentIndex, imageURLs.indices.contains(target) else {
            return
        }
        currentIndex = target
        ensurePage(at: target)?.resetZoom()
        scrollToCurrentPage(animated: true)
        updateCounter()
        emitIndexChange()
        loadVisiblePages()
    }

    @objc private func closeTapped() {
        onClose()
    }

    @objc private func prevTapped() {
        move(by: -1)
    }

    @objc private func nextTapped() {
        move(by: 1)
    }
}

extension PiliImageViewer: UIScrollViewDelegate {
    public func scrollViewDidScroll(_ scrollView: UIScrollView) {
        guard scrollView === pageScrollView, bounds.width > 0 else {
            return
        }
        let index = Int((scrollView.contentOffset.x / bounds.width).rounded())
        if index != currentIndex, imageURLs.indices.contains(index) {
            currentIndex = index
            updateCounter()
            emitIndexChange()
            loadVisiblePages()
        }
    }
}

private final class ImagePageScrollView: UIScrollView, UIScrollViewDelegate {
    let imageView = UIImageView()
    var onDismissPan: ((CGFloat, CGFloat, Bool) -> Void)?
    var isContextMenuEnabled = true

    private static let imageManager = SDWebImageManager(
        cache: SDImageCache.shared,
        loader: SDImageLoadersManager.shared
    )

    private let placeholderView = UIImageView()
    private var retryTap: UITapGestureRecognizer?
    private var currentURL: String?
    private var loadOperation: SDWebImageCombinedOperation?
    private var loadGeneration = 0
    private var needsRetry = false

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        minimumZoomScale = 1
        maximumZoomScale = 4
        showsHorizontalScrollIndicator = false
        showsVerticalScrollIndicator = false
        bouncesZoom = true
        delegate = self

        placeholderView.contentMode = .center
        placeholderView.image = UIImage(systemName: "photo")
        placeholderView.tintColor = UIColor.white.withAlphaComponent(0.35)
        placeholderView.isHidden = true
        placeholderView.isUserInteractionEnabled = false
        addSubview(placeholderView)

        imageView.contentMode = .scaleAspectFit
        imageView.frame = bounds
        imageView.isUserInteractionEnabled = true
        imageView.addInteraction(UIContextMenuInteraction(delegate: self))
        addSubview(imageView)

        let pan = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
        pan.delegate = self
        imageView.addGestureRecognizer(pan)

        let retryTap = UITapGestureRecognizer(target: self, action: #selector(retryTapped))
        retryTap.delegate = self
        retryTap.isEnabled = false
        imageView.addGestureRecognizer(retryTap)
        self.retryTap = retryTap
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    deinit {
        loadOperation?.cancel()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        imageView.frame = bounds
        placeholderView.frame = bounds
        centerContent()
    }

    func viewForZooming(in scrollView: UIScrollView) -> UIView? {
        return imageView
    }

    func scrollViewDidZoom(_ scrollView: UIScrollView) {
        centerContent()
    }

    func resetZoom() {
        zoomScale = 1
        contentOffset = .zero
        centerContent()
    }

    func cancelImageLoad() {
        loadGeneration += 1
        loadOperation?.cancel()
        loadOperation = nil
        currentURL = nil
        needsRetry = false
        retryTap?.isEnabled = false
        placeholderView.isHidden = true
        imageView.image = nil
    }

    func unloadImage() {
        loadGeneration += 1
        loadOperation?.cancel()
        loadOperation = nil
        currentURL = nil
        needsRetry = false
        retryTap?.isEnabled = false
        imageView.image = nil
        placeholderView.isHidden = true
    }

    func loadImage(urlString: String) {
        if currentURL == urlString && !needsRetry {
            return
        }

        loadGeneration += 1
        let generation = loadGeneration
        currentURL = urlString
        needsRetry = false
        retryTap?.isEnabled = false
        loadOperation?.cancel()
        loadOperation = nil
        imageView.image = nil
        placeholderView.isHidden = false

        guard let url = URL(string: urlString) else {
            needsRetry = true
            retryTap?.isEnabled = true
            centerContent()
            return
        }

        let operation = Self.imageManager.loadImage(
            with: url,
            options: [.retryFailed, .handleCookies],
            context: nil,
            progress: nil
        ) { [weak self] image, _, _, _, finished, _ in
            guard let self, self.currentURL == urlString, self.loadGeneration == generation else {
                return
            }
            self.loadOperation = nil
            if let image {
                self.imageView.image = image
                self.placeholderView.isHidden = true
                self.needsRetry = false
                self.retryTap?.isEnabled = false
            } else if finished {
                self.imageView.image = nil
                self.placeholderView.isHidden = false
                self.needsRetry = true
                self.retryTap?.isEnabled = true
            }
            self.centerContent()
        }
        if let operation {
            loadOperation = operation
        } else {
            needsRetry = true
            retryTap?.isEnabled = true
        }
    }

    @objc private func retryTapped() {
        guard needsRetry, let urlString = currentURL else {
            return
        }
        loadImage(urlString: urlString)
    }

    private func centerContent() {
        let boundsSize = bounds.size
        let imageSize = imageView.image?.size ?? boundsSize
        let widthScale = boundsSize.width / max(imageSize.width, 1)
        let heightScale = boundsSize.height / max(imageSize.height, 1)
        let scale = min(widthScale, heightScale)
        let scaledWidth = imageSize.width * scale
        let scaledHeight = imageSize.height * scale
        let x = max(0, (boundsSize.width - scaledWidth) / 2)
        let y = max(0, (boundsSize.height - scaledHeight) / 2)
        contentInset = UIEdgeInsets(top: y, left: x, bottom: y, right: x)
    }

    @objc private func handlePan(_ gesture: UIPanGestureRecognizer) {
        guard zoomScale <= 1.01 else {
            return
        }
        let translation = gesture.translation(in: self)
        let velocity = gesture.velocity(in: self)
        let vertical = translation.y > 0 && abs(translation.y) > abs(translation.x) * 1.2

        switch gesture.state {
        case .began, .changed:
            if vertical {
                onDismissPan?(max(0, translation.y), velocity.y, false)
            }
        case .ended, .cancelled, .failed:
            onDismissPan?(max(0, translation.y), velocity.y, true)
        default:
            break
        }
    }
}

extension ImagePageScrollView: UIGestureRecognizerDelegate {
    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        return true
    }
}

extension ImagePageScrollView: UIContextMenuInteractionDelegate {
    func contextMenuInteraction(
        _ interaction: UIContextMenuInteraction,
        configurationForMenuAtLocation location: CGPoint
    ) -> UIContextMenuConfiguration? {
        guard isContextMenuEnabled, let urlString = currentURL else {
            return nil
        }
        let hasImage = imageView.image != nil
        return UIContextMenuConfiguration(identifier: nil, previewProvider: nil) { [weak self] _ in
            var actions: [UIAction] = []
            if hasImage {
                actions.append(UIAction(
                    title: "保存图片",
                    image: UIImage(systemName: "square.and.arrow.down")
                ) { _ in
                    self?.saveImageToPhotos()
                })
            }
            actions.append(UIAction(
                title: "复制图片地址",
                image: UIImage(systemName: "doc.on.doc")
            ) { _ in
                UIPasteboard.general.string = urlString
                PiliToastOverlay.shared.show(message: "图片地址已复制", durationMs: 1600)
            })
            return UIMenu(title: "", children: actions)
        }
    }

    private func saveImageToPhotos() {
        guard let urlString = currentURL else {
            PiliToastOverlay.shared.show(message: "图片尚未加载完成", durationMs: 1600)
            return
        }
        Task {
            do {
                _ = try await PiliNativeCoreModule.saveImageToPhotos(uri: urlString)
                PiliToastOverlay.shared.show(message: "已保存到相册", durationMs: 1600)
            } catch {
                PiliToastOverlay.shared.show(message: "保存失败", durationMs: 1600)
            }
        }
    }
}

private func cachedImageData(for key: String) -> Data? {
    SDImageCache.shared.diskImageData(forKey: key)
}
