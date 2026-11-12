---
title: 没有 Mac，iOS 应用怎么构建和上架
date: 2026-11-10
description: 签名、打包、上传 App Store Connect 都必须在 macOS 上完成。这篇讲清楚需要哪些东西，以及怎样用一台远程 Mac 走完整个流程。
---

iOS 应用的编译、签名和上传都依赖 Xcode，而 Xcode 只能在 macOS 上运行。没有 Mac 的开发者（比如用 Flutter、React Native 或 Unity 做跨平台开发的团队）最后一步总要找一台 Mac。租一台远程的 Mac mini 是成本最低的办法之一。

## 你需要准备的

- 一个 Apple Developer 账号（个人或公司，需要自行年费注册）。
- 项目源码（推送到你自己的 Git 仓库，机器上拉取即可）。
- 一台远程 Mac：能装 Xcode、能用 UU 远程连接。

## 一次完整的流程

1. **连接并拉代码**：用 UU 远程连上机器，从 App Store 安装 Xcode（首次需要登录 Apple ID，并同意许可协议），再 `git clone` 你的项目。
2. **登录开发者账号**：Xcode → Settings → Accounts 添加 Apple ID，选择团队。推荐使用“自动管理签名”，Xcode 会替你创建证书和描述文件。
3. **本地跑通**：先在模拟器里运行一次，确认依赖都装好（CocoaPods、Flutter 等按各自文档安装）。
4. **归档**：Product → Archive。也可以用命令行：

```
xcodebuild -workspace App.xcworkspace -scheme App \
  -configuration Release -archivePath build/App.xcarchive archive
```

5. **上传**：在 Organizer 里选中归档，点 Distribute App → App Store Connect → Upload。命令行方式是准备好 `ExportOptions.plist`（`method` 设为 `app-store-connect`，`destination` 设为 `upload`），再执行：

```
xcodebuild -exportArchive -archivePath build/App.xcarchive \
  -exportOptionsPlist ExportOptions.plist -exportPath build/export
```

6. **提交审核**：回到 App Store Connect 网页，选择刚上传的构建，补全信息后提交审核。这一步在你自己的电脑上就能完成。

## 用 fastlane 把它自动化

如果你每个版本都要这样来一遍，建议用 fastlane 写一个 `lane`，把“拉代码、测试、归档、上传”串起来，以后连上机器只需要运行一条命令。

## 几点提醒

- **私钥和证书要备份**：分发证书的私钥只在生成它的那台机器上。租期结束机器会抹盘，请提前把证书导出（`.p12`）并妥善保存，或者始终使用自动管理签名并在新机器上重新生成。
- **清理凭证**：退租前在钥匙串里删除你的证书和登录信息，并退出 Apple ID。
- **构建缓存很占空间**：256GB 存储装完 Xcode 后空间不算宽裕，定期清理 DerivedData 和旧的模拟器运行时。
- **按需租用**：不是每天都在发版的话，选月付或季付，到期不续就行，没有设备压在手里。
