# PiliPlus RN

PiliPlus（Bilibili 第三方客户端）的 React Native 实现：Expo SDK 57 / React Native 0.86 / React 19.2 / TypeScript strict，包含基于 Expo Modules API 的 Swift 原生模块。

## 目录结构

- `src/` — RN 应用源码（expo-router 文件路由、zustand 状态管理）
- `modules/` — Swift 原生模块（pili-audio / pili-danmaku / pili-dlna / pili-live / pili-native-core / pili-player / pili-video-enhance / pili-webview）
- `plugins/` — Expo config plugins
- `assets/` — 静态资源

## 开发

```bash
npm install
npm start
```

## 技术栈

- Expo SDK 57 · React Native 0.86 · React 19.2
- TypeScript strict
- SwiftUI / @expo/ui 原生 UI 宿主
