// Copyright 2026 PiliPlus. All rights reserved.

import AVFoundation
import ExpoModulesCore
import MediaPlayer
import PiliNativeCore
import SDWebImage
import UIKit

public final class PiliAudioModule: Module {
  private static let sleepDeadlineKey = "PiliPlus.sleepTimer.deadline"

  private var shouldPlayInBackground = false
  private var remoteCommandsEnabled = false
  private var nowPlayingInfo: [String: Any] = [:]
  private var currentArtworkUrl: String?
  private var cachedArtwork: MPMediaItemArtwork?
  private var artworkLoadToken: UUID?
  private var remoteCommandBackgroundTask: UIBackgroundTaskIdentifier = .invalid
  private var audioTransitionBackgroundTask: UIBackgroundTaskIdentifier = .invalid
  private var audioTransitionToken: String?
  private var nowPlayingUpdateStartDate: Date?
  private var nowPlayingUpdateElapsed: TimeInterval = 0
  private var nowPlayingUpdateDuration: TimeInterval = 0
  private var remoteCommandTargets: [String: Any] = [:]
  private var boundSharedPlayer: AVPlayer?
  private var periodicTimeObserver: Any?
  private var statusObservation: NSKeyValueObservation?
  private var sharedCurrentItemObservation: NSKeyValueObservation?
  private weak var observedEndItem: AVPlayerItem?
  private var isLoaded = false
  private var didJustFinish = false
  private var pendingStartTime: Double = 0
  private var preferredPlaybackRate: Double = 1.0
  private var wasPlayingBeforeInterruption = false
  private var audioSessionObserversRegistered = false
  private var playbackStatusListenerCount = 0
  private var sleepRemainingUpdatesEnabled = false
  private var sleepRemainingTimer: Timer?

  private var activePlayer: AVPlayer? {
    boundSharedPlayer
  }

  private var activeItem: AVPlayerItem? {
    boundSharedPlayer?.currentItem
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  public func definition() -> ModuleDefinition {
    Name("PiliAudio")

    Events(
      "onRemoteCommand",
      "onInterruption",
      "onRouteChanged",
      "onPlaybackStatus",
      "onSleepRemainingChanged"
    )

    OnCreate {
      Self.configureSharedSession(playsInSilentMode: true, shouldPlayInBackground: false)
      self.setupAudioSessionObservers()
    }

    OnDestroy {
      NotificationCenter.default.removeObserver(self)
      self.audioSessionObserversRegistered = false
      self.performOnMain {
        self.stopSleepRemainingTimer()
        self.releaseAll()
      }
    }

    AsyncFunction("isAvailableAsync") { () -> Bool in
      true
    }

    AsyncFunction("configureAsync") { (playsInSilentMode: Bool, shouldPlayInBackground: Bool) in
      try self.configure(playsInSilentMode: playsInSilentMode, shouldPlayInBackground: shouldPlayInBackground)
    }

    AsyncFunction("setNowPlayingAsync") { (title: String?, artist: String?, artworkUrl: String?, duration: Double, currentTime: Double, rate: Double, isLiveStream: Bool) in
      self.setNowPlaying(
        title: title,
        artist: artist,
        artworkUrl: artworkUrl,
        duration: duration,
        currentTime: currentTime,
        rate: rate,
        isLiveStream: isLiveStream
      )
    }

    AsyncFunction("clearNowPlayingAsync") {
      self.clearNowPlaying()
    }

    AsyncFunction("syncNowPlayingAsync") { (currentTime: Double, duration: Double, rate: Double) in
      self.syncNowPlaying(currentTime: currentTime, duration: duration, rate: rate)
    }

    AsyncFunction("setActiveAsync") { (active: Bool) in
      try self.setActive(active)
    }

    AsyncFunction("beginAudioTransitionTaskAsync") { () -> String in
      self.beginAudioTransitionTask()
    }

    AsyncFunction("endAudioTransitionTaskAsync") { (token: String) in
      self.endAudioTransitionTask(token)
    }

    AsyncFunction("setPlaybackStatusUpdatesAsync") { (listenerCount: Int) in
      self.playbackStatusListenerCount = max(0, listenerCount)
      self.performOnMain {
        self.updatePeriodicObserver()
      }
    }

    AsyncFunction("getSleepRemainingMsAsync") { () -> Double in
      self.sleepRemainingMs()
    }

    AsyncFunction("setSleepRemainingUpdatesAsync") { (enabled: Bool) in
      self.sleepRemainingUpdatesEnabled = enabled
      self.performOnMain {
        self.updateSleepRemainingTimer()
      }
    }

    AsyncFunction("bindSharedPlayerAsync") { (player: SharedRef<AVPlayer>) in
      self.bindSharedPlayer(player)
    }

    AsyncFunction("playAsync") {
      self.play()
    }

    AsyncFunction("pauseAsync") {
      self.pause()
    }

    AsyncFunction("setVolumeAsync") { (volume: Double) in
      self.setVolume(volume)
    }

    AsyncFunction("releaseAsync") {
      self.performOnMain {
        self.releaseAll()
      }
    }

    OnAppEntersBackground {
      if self.shouldPlayInBackground {
        try? AVAudioSession.sharedInstance().setActive(true)
        self.performOnMain {
          self.updatePeriodicObserver()
        }
      } else {
        self.performOnMain {
          self.pause()
          self.clearNowPlaying()
        }
        try? AVAudioSession.sharedInstance().setActive(
          false,
          options: [.notifyOthersOnDeactivation]
        )
      }
    }
  }

  // MARK: - Audio session

  private func configure(playsInSilentMode: Bool, shouldPlayInBackground: Bool) throws {
    self.shouldPlayInBackground = shouldPlayInBackground

    Self.configureSharedSession(
      playsInSilentMode: playsInSilentMode,
      shouldPlayInBackground: shouldPlayInBackground
    )
    try AVAudioSession.sharedInstance().setActive(true)
  }

  static func configureSharedSession(playsInSilentMode: Bool, shouldPlayInBackground: Bool) {
    let session = AVAudioSession.sharedInstance()
    // 后台听视频需要 playback 类别；纯前台且静音开关关闭时回退到 soloAmbient。
    let category: AVAudioSession.Category = playsInSilentMode || shouldPlayInBackground ? .playback : .soloAmbient
    let options: AVAudioSession.CategoryOptions = category == .playback ? [.allowAirPlay] : []
    try? session.setCategory(category, mode: .moviePlayback, options: options)
  }

  private func setActive(_ active: Bool) throws {
    try AVAudioSession.sharedInstance().setActive(
      active,
      options: active ? [] : [.notifyOthersOnDeactivation]
    )
  }

  private func beginAudioTransitionTask() -> String {
    let token = UUID().uuidString
    mainSync {
      let task = UIApplication.shared.beginBackgroundTask(withName: "PiliPlus.audio-transition") {
        [weak self] in
        guard let self, self.audioTransitionToken == token else {
          return
        }
        UIApplication.shared.endBackgroundTask(self.audioTransitionBackgroundTask)
        self.audioTransitionBackgroundTask = .invalid
        self.audioTransitionToken = nil
      }
      self.audioTransitionBackgroundTask = task
      self.audioTransitionToken = token
    }
    return token
  }

  private func endAudioTransitionTask(_ token: String) {
    mainSync {
      guard self.audioTransitionToken == token, self.audioTransitionBackgroundTask != .invalid else {
        return
      }
      UIApplication.shared.endBackgroundTask(self.audioTransitionBackgroundTask)
      self.audioTransitionBackgroundTask = .invalid
      self.audioTransitionToken = nil
    }
  }

  private func bindSharedPlayer(_ sharedPlayer: SharedRef<AVPlayer>) {
    performOnMain {
      self.releasePlayer()
      self.boundSharedPlayer = sharedPlayer.ref
      self.isLoaded = sharedPlayer.ref.currentItem != nil
      self.didJustFinish = false
      self.pendingStartTime = 0
      self.preferredPlaybackRate = 1.0

      if let item = sharedPlayer.ref.currentItem {
        self.observeItemStatus(item)
        self.observedEndItem = item
        NotificationCenter.default.addObserver(
          self,
          selector: #selector(handleItemDidPlayToEnd(_:)),
          name: AVPlayerItem.didPlayToEndTimeNotification,
          object: item
        )
      }
      self.sharedCurrentItemObservation?.invalidate()
      self.sharedCurrentItemObservation = sharedPlayer.ref.observe(
        \.currentItem,
        options: [.new, .old]
      ) { [weak self] player, _ in
        guard let self else {
          return
        }
        self.performOnMain {
          self.handleSharedItemChange(player: player)
        }
      }
      self.installPeriodicObserver()
      if !self.nowPlayingInfo.isEmpty {
        self.syncNowPlaying(
          currentTime: self.currentPlaybackTime(),
          duration: self.currentDuration(),
          rate: self.currentPlaybackRate()
        )
      }
      self.sendPlaybackStatus()
    }
  }

  private func handleSharedItemChange(player: AVPlayer) {
    if let previous = observedEndItem, previous !== player.currentItem {
      NotificationCenter.default.removeObserver(
        self,
        name: AVPlayerItem.didPlayToEndTimeNotification,
        object: previous
      )
      observedEndItem = nil
    }

    guard let item = player.currentItem else {
      isLoaded = false
      didJustFinish = false
      sendPlaybackStatus()
      updatePeriodicObserver()
      return
    }

    observeItemStatus(item)
    if observedEndItem !== item {
      NotificationCenter.default.addObserver(
        self,
        selector: #selector(handleItemDidPlayToEnd(_:)),
        name: AVPlayerItem.didPlayToEndTimeNotification,
        object: item
      )
      observedEndItem = item
    }
    isLoaded = true
    didJustFinish = false
    sendPlaybackStatus()
    updatePeriodicObserver()
  }

  private func installPeriodicObserver() {
    removePeriodicObserver()
    guard let player = activePlayer,
          isActuallyPlaying(),
          playbackStatusListenerCount > 0,
          UIApplication.shared.applicationState != .background else {
      return
    }
    periodicTimeObserver = player.addPeriodicTimeObserver(
      forInterval: CMTime(seconds: 0.5, preferredTimescale: 600),
      queue: .main
    ) { [weak self] _ in
      self?.sendPlaybackStatus()
      self?.refreshNowPlaying()
    }
  }

  private func removePeriodicObserver() {
    if let periodicTimeObserver, let player = activePlayer {
      player.removeTimeObserver(periodicTimeObserver)
    }
    periodicTimeObserver = nil
  }

  private func updatePeriodicObserver() {
    if isActuallyPlaying() && playbackStatusListenerCount > 0 {
      installPeriodicObserver()
    } else {
      removePeriodicObserver()
    }
  }

  private func observeItemStatus(_ item: AVPlayerItem) {
    statusObservation?.invalidate()
    statusObservation = item.observe(\.status, options: [.new, .initial]) { [weak self] item, _ in
      self?.handleItemStatusChange(item)
    }
  }

  private func handleItemStatusChange(_ item: AVPlayerItem) {
    performOnMain {
      switch item.status {
      case .readyToPlay:
        self.isLoaded = true
        self.didJustFinish = false
        if self.pendingStartTime > 0 {
          let startTime = self.pendingStartTime
          self.pendingStartTime = 0
          self.seek(to: startTime)
        }
        if !self.nowPlayingInfo.isEmpty {
          self.syncNowPlaying(
            currentTime: self.currentPlaybackTime(),
            duration: self.currentDuration(),
            rate: self.currentPlaybackRate()
          )
        }
        self.sendPlaybackStatus()
        self.updatePeriodicObserver()
      case .failed:
        self.isLoaded = false
        self.sendPlaybackStatus()
      default:
        break
      }
    }
  }

  private func play() {
    performOnMain {
      guard let player = self.activePlayer else {
        return
      }
      try? AVAudioSession.sharedInstance().setActive(true)
      if self.didJustFinish || self.isAtEnd() {
        self.didJustFinish = false
        self.seek(to: 0)
      }
      player.rate = Float(self.preferredPlaybackRate)
      let rate = self.preferredPlaybackRate
      self.nowPlayingInfo[MPNowPlayingInfoPropertyPlaybackRate] = rate
      self.syncNowPlaying(
        currentTime: self.currentPlaybackTime(),
        duration: self.currentDuration(),
        rate: rate
      )
      self.sendPlaybackStatus()
      self.updatePeriodicObserver()
    }
  }

  private func pause() {
    performOnMain {
      self.activePlayer?.pause()
      self.nowPlayingInfo[MPNowPlayingInfoPropertyPlaybackRate] = 0.0
      self.syncNowPlaying(
        currentTime: self.currentPlaybackTime(),
        duration: self.currentDuration(),
        rate: 0
      )
      self.stopNowPlayingUpdates()
      self.sendPlaybackStatus()
      self.updatePeriodicObserver()
    }
  }

  private func seek(to seconds: Double) {
    performOnMain {
      guard let player = self.activePlayer else {
        return
      }
      let clampedSeconds = max(seconds, 0)
      let time = CMTime(seconds: clampedSeconds, preferredTimescale: 600)
      player.seek(to: time, toleranceBefore: .zero, toleranceAfter: .zero)
      self.didJustFinish = false
      self.nowPlayingInfo[MPNowPlayingInfoPropertyElapsedPlaybackTime] = clampedSeconds
      self.nowPlayingUpdateStartDate = Date()
      self.nowPlayingUpdateElapsed = clampedSeconds
      MPNowPlayingInfoCenter.default().nowPlayingInfo = self.nowPlayingInfo
      self.sendPlaybackStatus()
    }
  }

  private func setRate(_ rate: Double) {
    performOnMain {
      guard let player = self.activePlayer else {
        return
      }
      if rate > 0 {
        self.preferredPlaybackRate = rate
      }
      player.rate = Float(rate)
      self.nowPlayingInfo[MPNowPlayingInfoPropertyPlaybackRate] = rate
      self.syncNowPlaying(
        currentTime: self.currentPlaybackTime(),
        duration: self.currentDuration(),
        rate: rate
      )
      if rate <= 0 {
        self.stopNowPlayingUpdates()
      }
      self.sendPlaybackStatus()
      self.updatePeriodicObserver()
    }
  }

  private func setVolume(_ volume: Double) {
    performOnMain {
      self.activePlayer?.volume = Float(min(max(volume, 0), 1))
    }
  }

  private func releasePlayer() {
    removePeriodicObserver()
    statusObservation?.invalidate()
    statusObservation = nil
    sharedCurrentItemObservation?.invalidate()
    sharedCurrentItemObservation = nil
    if let item = activeItem {
      NotificationCenter.default.removeObserver(
        self,
        name: AVPlayerItem.didPlayToEndTimeNotification,
        object: item
      )
    }
    observedEndItem = nil
    boundSharedPlayer?.pause()
    boundSharedPlayer = nil
    isLoaded = false
    didJustFinish = false
    pendingStartTime = 0
    preferredPlaybackRate = 1.0
    wasPlayingBeforeInterruption = false
  }

  private func releaseAll() {
    releasePlayer()
    stopNowPlayingUpdates()
    nowPlayingInfo.removeAll()
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    disableRemoteCommands()
    endRemoteCommandBackgroundTask()
    currentArtworkUrl = nil
    cachedArtwork = nil
    artworkLoadToken = nil
    shouldPlayInBackground = false
  }

  private func currentPlaybackTime() -> Double {
    guard let item = activeItem else {
      return 0
    }
    let time = item.currentTime()
    guard time.isValid, time.isNumeric else {
      return 0
    }
    return max(CMTimeGetSeconds(time), 0)
  }

  private func currentDuration() -> Double {
    guard let item = activeItem else {
      return 0
    }
    let duration = item.duration
    guard duration.isValid, duration.isNumeric else {
      return 0
    }
    return max(CMTimeGetSeconds(duration), 0)
  }

  private func isActuallyPlaying() -> Bool {
    guard let player = activePlayer else {
      return false
    }
    return player.rate > 0 || player.timeControlStatus == .playing
  }

  private func isAtEnd() -> Bool {
    let duration = currentDuration()
    return duration > 0 && currentPlaybackTime() >= duration - 0.05
  }

  private func sendPlaybackStatus() {
    guard playbackStatusListenerCount > 0 else {
      return
    }
    sendEvent("onPlaybackStatus", [
      "isLoaded": isLoaded,
      "playing": isActuallyPlaying(),
      "currentTime": currentPlaybackTime(),
      "duration": currentDuration(),
      "didJustFinish": didJustFinish,
    ])
  }

  @objc
  private func handleItemDidPlayToEnd(_ notification: Notification) {
    performOnMain {
      self.didJustFinish = true
      self.nowPlayingInfo[MPNowPlayingInfoPropertyPlaybackRate] = 0.0
      let duration = self.currentDuration()
      if duration > 0 {
        self.nowPlayingInfo[MPNowPlayingInfoPropertyElapsedPlaybackTime] = duration
      }
      MPNowPlayingInfoCenter.default().nowPlayingInfo = self.nowPlayingInfo
      self.stopNowPlayingUpdates()
      self.sendPlaybackStatus()
      self.updatePeriodicObserver()
    }
  }

  private func setupAudioSessionObservers() {
    guard !audioSessionObserversRegistered else {
      return
    }
    audioSessionObserversRegistered = true

    let session = AVAudioSession.sharedInstance()
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleAudioSessionInterruption(_:)),
      name: AVAudioSession.interruptionNotification,
      object: session
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleMediaServicesReset(_:)),
      name: AVAudioSession.mediaServicesWereResetNotification,
      object: session
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleAudioSessionRouteChange(_:)),
      name: AVAudioSession.routeChangeNotification,
      object: session
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleSleepTimerFired(_:)),
      name: .piliPlusSleepTimerFired,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleAppDidBecomeActive),
      name: UIApplication.didBecomeActiveNotification,
      object: nil
    )
  }

  @objc
  private func handleAppDidBecomeActive() {
    performOnMain {
      self.updatePeriodicObserver()
      self.updateSleepRemainingTimer()
    }
  }

  @objc
  private func handleSleepTimerFired(_ notification: Notification) {
    performOnMain {
      self.pause()
      self.sendSleepRemainingChanged()
    }
  }

  @objc
  private func handleAudioSessionInterruption(_ notification: Notification) {
    guard let userInfo = notification.userInfo,
      let interruptionTypeRaw = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
      let interruptionType = AVAudioSession.InterruptionType(rawValue: interruptionTypeRaw)
    else {
      return
    }

    switch interruptionType {
    case .began:
      performOnMain {
        self.wasPlayingBeforeInterruption = self.isActuallyPlaying()
        if self.wasPlayingBeforeInterruption {
          self.pause()
        }
        self.sendEvent("onInterruption", ["state": "begin", "options": []])
      }

    case .ended:
      var options: [String] = []
      if let optionsRaw = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt {
        let interruptionOptions = AVAudioSession.InterruptionOptions(rawValue: optionsRaw)
        if interruptionOptions.contains(.shouldResume) {
          options.append("shouldResume")
        }
      }
      performOnMain {
        if options.contains("shouldResume") {
          try? AVAudioSession.sharedInstance().setActive(true)
          if self.wasPlayingBeforeInterruption {
            self.play()
          }
        }
        self.wasPlayingBeforeInterruption = false
        self.sendEvent("onInterruption", ["state": "end", "options": options])
      }

    @unknown default:
      break
    }
  }

  @objc
  private func handleMediaServicesReset(_ notification: Notification) {
    performOnMain {
      if !self.nowPlayingInfo.isEmpty {
        MPNowPlayingInfoCenter.default().nowPlayingInfo = self.nowPlayingInfo
      }
      try? AVAudioSession.sharedInstance().setActive(true)
    }
  }

  @objc
  private func handleAudioSessionRouteChange(_ notification: Notification) {
    guard let reasonRaw = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
      let reason = AVAudioSession.RouteChangeReason(rawValue: reasonRaw),
      reason == .oldDeviceUnavailable
    else {
      return
    }

    performOnMain {
      if self.isActuallyPlaying() {
        self.pause()
      }
      // 耳机拔出时通知 JS 暂停，避免音频继续通过扬声器外放。
      self.sendEvent("onRouteChanged", ["shouldPause": true])
    }
  }

  // MARK: - Now Playing

  private func setNowPlaying(
    title: String?,
    artist: String?,
    artworkUrl: String?,
    duration: Double,
    currentTime: Double,
    rate: Double,
    isLiveStream: Bool = false
  ) {
    performOnMain {
      self.stopNowPlayingUpdates()
      self.nowPlayingInfo = [:]

      if let title, !title.isEmpty {
        self.nowPlayingInfo[MPMediaItemPropertyTitle] = title
      }
      if let artist, !artist.isEmpty {
        self.nowPlayingInfo[MPMediaItemPropertyArtist] = artist
      }
      if rate > 0 {
        self.preferredPlaybackRate = rate
      }

      if isLiveStream {
        self.nowPlayingInfo[MPNowPlayingInfoPropertyIsLiveStream] = true
        self.nowPlayingInfo.removeValue(forKey: MPMediaItemPropertyPlaybackDuration)
        self.nowPlayingInfo.removeValue(forKey: MPNowPlayingInfoPropertyElapsedPlaybackTime)
        self.nowPlayingInfo.removeValue(forKey: MPNowPlayingInfoPropertyPlaybackRate)
      } else {
        self.nowPlayingInfo.removeValue(forKey: MPNowPlayingInfoPropertyIsLiveStream)
        self.applyProgress(duration: duration, currentTime: currentTime, rate: rate)
      }
      self.nowPlayingInfo[MPNowPlayingInfoPropertyMediaType] = MPNowPlayingInfoMediaType.audio.rawValue
      MPNowPlayingInfoCenter.default().nowPlayingInfo = self.nowPlayingInfo

      self.enableRemoteCommands(isLiveStream: isLiveStream)
      if !isLiveStream {
        self.startNowPlayingUpdates(durationSeconds: duration, elapsedSeconds: currentTime)
      }
      self.updatePeriodicObserver()

      if let artworkUrl, !artworkUrl.isEmpty {
        self.loadArtwork(urlString: artworkUrl)
      } else {
        self.currentArtworkUrl = nil
        self.cachedArtwork = nil
        self.artworkLoadToken = nil
      }
    }
  }

  private func syncNowPlaying(currentTime: Double, duration: Double, rate: Double) {
    performOnMain {
      self.applyProgress(duration: duration, currentTime: currentTime, rate: rate)
      self.nowPlayingUpdateStartDate = Date()
      self.nowPlayingUpdateElapsed = max(currentTime, 0)
      if duration > 0 {
        self.nowPlayingUpdateDuration = duration
      }
      MPNowPlayingInfoCenter.default().nowPlayingInfo = self.nowPlayingInfo
    }
  }

  private func clearNowPlaying() {
    performOnMain {
      self.stopNowPlayingUpdates()
      self.nowPlayingInfo.removeAll()
      MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
      self.disableRemoteCommands()
      self.currentArtworkUrl = nil
      self.cachedArtwork = nil
      self.artworkLoadToken = nil
      self.updatePeriodicObserver()
    }
  }

  // MARK: - Sleep timer remaining

  private func sleepRemainingMs() -> Double {
    let deadline = UserDefaults.standard.double(forKey: Self.sleepDeadlineKey)
    guard deadline > 0 else {
      return 0
    }
    return max(0, deadline - Date().timeIntervalSince1970) * 1000
  }

  private func updateSleepRemainingTimer() {
    stopSleepRemainingTimer()
    guard sleepRemainingUpdatesEnabled else {
      return
    }
    let timer = Timer(timeInterval: 30, repeats: true) { [weak self] _ in
      self?.sendSleepRemainingChanged()
    }
    timer.tolerance = 5
    RunLoop.main.add(timer, forMode: .common)
    sleepRemainingTimer = timer
    sendSleepRemainingChanged()
  }

  private func stopSleepRemainingTimer() {
    sleepRemainingTimer?.invalidate()
    sleepRemainingTimer = nil
  }

  private func sendSleepRemainingChanged() {
    sendEvent("onSleepRemainingChanged", ["remainingMs": sleepRemainingMs()])
  }

  private func startNowPlayingUpdates(durationSeconds: TimeInterval, elapsedSeconds: TimeInterval) {
    let duration = max(durationSeconds, 0)
    let elapsed = max(elapsedSeconds, 0)

    self.nowPlayingUpdateDuration = duration
    self.nowPlayingUpdateStartDate = Date()
    self.nowPlayingUpdateElapsed = elapsed

    self.applyProgress(duration: duration, currentTime: elapsed, rate: self.currentPlaybackRate())
    MPNowPlayingInfoCenter.default().nowPlayingInfo = self.nowPlayingInfo
  }

  private func stopNowPlayingUpdates() {
    performOnMain {
      self.nowPlayingUpdateStartDate = nil
      self.nowPlayingUpdateElapsed = 0
      self.nowPlayingUpdateDuration = 0
    }
  }

  private func updateNowPlayingProgress() {
    performOnMain {
      guard let startDate = self.nowPlayingUpdateStartDate else {
        return
      }

      let rate = self.currentPlaybackRate()
      let elapsed = self.nowPlayingUpdateElapsed + Date().timeIntervalSince(startDate) * rate
      let clampedElapsed = self.nowPlayingUpdateDuration > 0
        ? min(max(elapsed, 0), self.nowPlayingUpdateDuration)
        : max(elapsed, 0)

      self.nowPlayingInfo[MPNowPlayingInfoPropertyElapsedPlaybackTime] = clampedElapsed
      if self.nowPlayingUpdateDuration > 0 {
        self.nowPlayingInfo[MPMediaItemPropertyPlaybackDuration] = self.nowPlayingUpdateDuration
      }
      MPNowPlayingInfoCenter.default().nowPlayingInfo = self.nowPlayingInfo
    }
  }

  private func refreshNowPlaying() {
    guard !nowPlayingInfo.isEmpty else {
      return
    }
    updateNowPlayingProgress()
  }

  private func applyProgress(duration: Double, currentTime: Double, rate: Double) {
    if duration > 0 {
      nowPlayingInfo[MPMediaItemPropertyPlaybackDuration] = duration
    } else {
      nowPlayingInfo.removeValue(forKey: MPMediaItemPropertyPlaybackDuration)
    }

    if currentTime >= 0 {
      nowPlayingInfo[MPNowPlayingInfoPropertyElapsedPlaybackTime] = currentTime
    } else {
      nowPlayingInfo.removeValue(forKey: MPNowPlayingInfoPropertyElapsedPlaybackTime)
    }

    if rate >= 0 {
      nowPlayingInfo[MPNowPlayingInfoPropertyPlaybackRate] = rate
    } else {
      nowPlayingInfo.removeValue(forKey: MPNowPlayingInfoPropertyPlaybackRate)
    }
  }

  private func loadArtwork(urlString: String) {
    guard currentArtworkUrl != urlString else {
      if let cachedArtwork {
        nowPlayingInfo[MPMediaItemPropertyArtwork] = cachedArtwork
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
      }
      return
    }

    currentArtworkUrl = urlString
    cachedArtwork = nil
    artworkLoadToken = nil

    guard let url = URL(string: urlString) else {
      return
    }

    let loadToken = UUID()
    artworkLoadToken = loadToken

    // 复用 SDImageCache.shared：锁屏封面与 expo-image 共用同一份磁盘/内存缓存，
    // 不再走独立 URLSession 下载重复缓存。
    SDWebImageManager.shared.loadImage(
      with: url,
      options: [.retryFailed],
      context: nil,
      progress: nil
    ) { [weak self] image, _, _, _, finished, _ in
      guard let self else {
        return
      }
      guard finished else {
        return
      }
      self.performOnMain {
        guard self.artworkLoadToken == loadToken, self.currentArtworkUrl == urlString else {
          return
        }
        self.artworkLoadToken = nil
        guard let image else {
          return
        }
        let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
        self.cachedArtwork = artwork
        self.nowPlayingInfo[MPMediaItemPropertyArtwork] = artwork
        MPNowPlayingInfoCenter.default().nowPlayingInfo = self.nowPlayingInfo
      }
    }
  }

  // MARK: - Remote commands

  private func enableRemoteCommands(isLiveStream: Bool = false) {
    let center = MPRemoteCommandCenter.shared()

    if !remoteCommandsEnabled {
      remoteCommandTargets["play"] = center.playCommand.addTarget { [weak self] _ in
        self?.handleRemoteCommand("play") ?? .commandFailed
      }
      remoteCommandTargets["pause"] = center.pauseCommand.addTarget { [weak self] _ in
        self?.handleRemoteCommand("pause") ?? .commandFailed
      }
      remoteCommandTargets["togglePlayPause"] = center.togglePlayPauseCommand.addTarget { [weak self] _ in
        self?.handleRemoteCommand("togglePlayPause") ?? .commandFailed
      }
      remoteCommandTargets["changePlaybackPosition"] = center.changePlaybackPositionCommand.addTarget { [weak self] event in
        guard let self, let seekEvent = event as? MPChangePlaybackPositionCommandEvent else {
          return .commandFailed
        }
        return self.handleRemoteCommand("seek", position: seekEvent.positionTime)
      }
      // 当前没有真实播放队列，先按固定 15 秒快进/快退实现。
      center.skipForwardCommand.preferredIntervals = [NSNumber(value: 15)]
      center.skipBackwardCommand.preferredIntervals = [NSNumber(value: 15)]
      remoteCommandTargets["skipForward"] = center.skipForwardCommand.addTarget { [weak self] event in
        guard let self, let skipEvent = event as? MPSkipIntervalCommandEvent else {
          return .commandFailed
        }
        return self.handleRemoteCommand("skipForward", interval: skipEvent.interval)
      }
      remoteCommandTargets["skipBackward"] = center.skipBackwardCommand.addTarget { [weak self] event in
        guard let self, let skipEvent = event as? MPSkipIntervalCommandEvent else {
          return .commandFailed
        }
        return self.handleRemoteCommand("skipBackward", interval: skipEvent.interval)
      }
      remoteCommandsEnabled = true
    }

    center.playCommand.isEnabled = true
    center.pauseCommand.isEnabled = true
    center.togglePlayPauseCommand.isEnabled = true
    center.changePlaybackPositionCommand.isEnabled = !isLiveStream
    center.skipForwardCommand.isEnabled = !isLiveStream
    center.skipBackwardCommand.isEnabled = !isLiveStream
  }

  private func disableRemoteCommands() {
    let center = MPRemoteCommandCenter.shared()
    removeRemoteCommandTarget(from: center.playCommand, key: "play")
    removeRemoteCommandTarget(from: center.pauseCommand, key: "pause")
    removeRemoteCommandTarget(from: center.togglePlayPauseCommand, key: "togglePlayPause")
    removeRemoteCommandTarget(from: center.changePlaybackPositionCommand, key: "changePlaybackPosition")
    removeRemoteCommandTarget(from: center.skipForwardCommand, key: "skipForward")
    removeRemoteCommandTarget(from: center.skipBackwardCommand, key: "skipBackward")
    center.playCommand.isEnabled = false
    center.pauseCommand.isEnabled = false
    center.togglePlayPauseCommand.isEnabled = false
    center.changePlaybackPositionCommand.isEnabled = false
    center.skipForwardCommand.isEnabled = false
    center.skipBackwardCommand.isEnabled = false
    remoteCommandTargets.removeAll()
    remoteCommandsEnabled = false
  }

  private func removeRemoteCommandTarget(from command: MPRemoteCommand, key: String) {
    guard let target = remoteCommandTargets.removeValue(forKey: key) else {
      return
    }
    command.removeTarget(target)
  }

  private func handleRemoteCommand(
    _ command: String,
    position: Double? = nil,
    interval: Double? = nil
  ) -> MPRemoteCommandHandlerStatus {
    keepSessionActiveForRemoteCommand()

    return mainSync {
      guard self.activePlayer != nil else {
        return .commandFailed
      }

      switch command {
      case "play", "pause", "togglePlayPause":
        break
      case "seek":
        guard position != nil else {
          return .commandFailed
        }
      case "skipForward", "skipBackward":
        guard interval != nil else {
          return .commandFailed
        }
      default:
        return .commandFailed
      }

      self.applyRemoteCommand(command, position: position, interval: interval)
      return .success
    }
  }

  private func applyRemoteCommand(
    _ command: String,
    position: Double?,
    interval: Double?
  ) {
    switch command {
    case "play":
      self.play()
    case "pause":
      self.pause()
    case "togglePlayPause":
      if self.isActuallyPlaying() {
        self.pause()
      } else {
        self.play()
      }
    case "seek":
      if let position {
        self.seek(to: position)
      }
    case "skipForward", "skipBackward":
      if let interval {
        let direction = command == "skipForward" ? 1.0 : -1.0
        let target = max(0, self.currentPlaybackTime() + direction * interval)
        let duration = self.currentDuration()
        let clamped = duration > 0 ? min(target, duration) : target
        self.seek(to: clamped)
      }
    default:
      break
    }

    var payload: [String: Any] = ["command": command]
    if let position {
      payload["position"] = position
    }
    if let interval {
      payload["interval"] = interval
    }
    self.sendEvent("onRemoteCommand", payload)
  }

  private func currentPlaybackRate() -> Double {
    if let rate = nowPlayingInfo[MPNowPlayingInfoPropertyPlaybackRate] as? Double {
      return rate
    }
    if let rate = nowPlayingInfo[MPNowPlayingInfoPropertyPlaybackRate] as? NSNumber {
      return rate.doubleValue
    }
    if let player = activePlayer, player.rate > 0 {
      return Double(player.rate)
    }
    return preferredPlaybackRate
  }

  private func keepSessionActiveForRemoteCommand() {
    performOnMain {
      try? AVAudioSession.sharedInstance().setActive(true)

      guard self.remoteCommandBackgroundTask == .invalid else {
        return
      }

      self.remoteCommandBackgroundTask = UIApplication.shared.beginBackgroundTask(
        withName: "PiliAudioRemoteCommand"
      ) { [weak self] in
        guard let self else {
          return
        }
        try? AVAudioSession.sharedInstance().setActive(true)
        self.endRemoteCommandBackgroundTask()
      }

      // 给原生播放器启动和锁屏信息同步留出时间；音频真正开始后由后台音频模式接管。
      DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) { [weak self] in
        self?.endRemoteCommandBackgroundTask()
      }
    }
  }

  private func endRemoteCommandBackgroundTask() {
    performOnMain {
      guard self.remoteCommandBackgroundTask != .invalid else {
        return
      }
      UIApplication.shared.endBackgroundTask(self.remoteCommandBackgroundTask)
      self.remoteCommandBackgroundTask = .invalid
    }
  }

  // MARK: - Helpers

  private func performOnMain(_ operation: @escaping () -> Void) {
    if Thread.isMainThread {
      operation()
    } else {
      DispatchQueue.main.async(execute: operation)
    }
  }

  private func mainSync<T>(_ operation: () -> T) -> T {
    if Thread.isMainThread {
      return operation()
    }
    return DispatchQueue.main.sync(execute: operation)
  }
}
