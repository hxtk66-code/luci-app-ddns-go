![hello](https://views.whatilearened.today/views/github/sirpdboy/deplives.svg) [![](https://img.shields.io/badge/TG群-点击加入-FFFFFF.svg)](https://t.me/joinchat/AAAAAEpRF88NfOK5vBXGBQ)

<h1 align="center">
  <br>DDNS GO<br>
</h1>

  <p align="center">

  <a target="_blank" href="https://github.com/sirpdboy/luci-app-ddns-go/releases">
    <img src="https://img.shields.io/github/release/sirpdboy/luci-app-ddns-go.svg?style=flat-square&label=ddns-go&colorB=green">
  </a>
</p>

[中文] | [English](README.md) 

![screenshots](https://raw.githubusercontent.com/sirpdboy/openwrt/master/doc/说明1.jpg)

请 **认真阅读完毕** 本页面，本页面包含注意事项和如何使用。

## 功能说明：

### ddns-go动态域名插件
#### 自动获得你的公网 IPv4 或 IPv6 地址，并解析到对应的域名服务。

<!-- TOC -->

- [ddns-go](#ddns-go)
  - [版本](#版本说明)
  - [特性](#特性)
  - [使用方法](#使用方法)
  - [说明](#说明)
  - [界面](#界面)
  - [捐助](#捐助)

<!-- /TOC -->

## 版本说明

## v2025.10.25 luci-app-ddns-go 1.6.3
  - 1.增加版本显示
  - 2.增加在线更新
  - 3.增加重置用户密码功能

## 2025.5.14  luci-app-ddns-go 1.5.2
## 2025.5.12  luci-app-ddns-go 1.5.1
- 更新日志：
- 适配最新OPENWRT24.10，JS版本。老版18.06用LUA分支。


## 特性

- 支持Mac、Windows、Linux系统，支持ARM、x86架构
- 支持的域名服务商 `Alidns(阿里云)` `Dnspod(腾讯云)` `Cloudflare` `华为云` `Callback` `百度云` `porkbun` `GoDaddy`
- 支持接口/网卡获取IP
- 支持以服务的方式运行
- 默认间隔5分钟同步一次
- 支持多个域名同时解析，公司必备
- 支持多级域名
- 网页中配置，简单又方便，可设置 `登录用户名和密码` / `禁止从公网访问`
- 网页中方便快速查看最近50条日志，不需要跑docker中查看
- 支持webhook通知
- 支持TTL
- 支持部分dns服务商传递自定义参数，实现地域解析等功能

## 使用方法

- 将luci-app-ddns-go添加至 LEDE/OpenWRT 源码的方法。

### 下载源码方法:

 ```Brach
 
    # 下载源码
	
    git clone https://github.com/sirpdboy/luci-app-ddns-go.git package/ddns-go
    make menuconfig
	
 ``` 
### 配置菜单

 ```Brach
    make menuconfig
	# 找到 LuCI -> Applications, 选择 luci-app-ddns-go, 保存后退出。
 ``` 
 
### 编译

 ```Brach 
    # 编译固件
    make package/ddns-go/luci-app-ddns-go/compile V=s
 ```

## 阿里云线路 / 扩展选项（Alidns Line）

本工程在 `基础设置（Base Setting）` 中增加了「阿里云线路与扩展选项」，默认关闭，不影响原有 ddns-go 的任何行为。

### 工作原理

- ddns-go 支持在域名后面追加查询参数，例如 `example.com?Line=telecom&Lang=en`，这些参数会被原样传给阿里云 `AddDomainRecord` / `UpdateDomainRecord` 接口（见 ddns-go Wiki「传递自定义参数」）。
- 阿里云 `AddCustomLine`（[接口文档](https://next.api.aliyun.com/document/Alidns/2015-01-09/AddCustomLine)）用于给域名创建自定义线路，必填 `DomainName`、`LineName`、`IpSegment`（`StartIp` / `EndIp`），成功后返回 `LineCode`（如 `hra0yc-597`）。这个 `LineCode` 可以直接作为 `Line` 参数使用。
- 本插件**不修改 ddns-go 程序、不拦截它的请求**：只是把 UCI 中配置的线路参数追加到 ddns-go 已经保存好的域名条目上，属于 ddns-go 原有的自定义参数机制。服务启动脚本在 `init_yaml` 之后、ddns-go 读取配置之前执行该操作，即「先完成 ddns-go 原有流程，再追加线路参数」。

### 使用步骤

1. 先在 ddns-go 自带 Web 界面完成原有配置（AccessKey、域名、IPv4/IPv6 获取方式等）并保存，使 `/etc/ddns-go/ddns-go-config.yaml` 生成，且服务商为 `alidns`。
2. 在 LuCI `服务 → DDNS-GO → 基础设置` 找到「阿里云线路与扩展选项」，勾选「启用线路参数」。
3. 选择线路（默认、电信/联通/移动、境外、中国内地、自定义线路等），按需填写 `RecordId`、`Lang`、其它接口参数和应用范围。页面会实时预览生成的域名参数，如 `example.com?Line=telecom&Lang=zh`。
4. 点「立即应用」，或直接点页面底部的「保存并应用」：保存并提交 UCI → 把参数追加到 YAML 中所有 alidns 配置的域名 → 重启 ddns-go。两条路径都会走同一套注入逻辑；`ddns-go.init` 还定义了 `reload_service`，UCI 变更触发 `reload_config` 时也会重启服务并重新注入，所以命令行 `uci commit && reload_config` 同样生效。
5. 需要还原时点「清除线路参数」：只移除本插件管理的参数（用户自己填的 `comment=xxx` 等会保留），**同时把「启用线路参数」开关置为关闭**，避免服务下次启动时又重新注入。

> 注意：`TTL` 由 ddns-go 自身的配置控制，不要写在「其它接口参数」里；`RecordId` 用于一个域名存在多条解析记录时指定具体记录。

### 生效与提交状态

线路配置区顶部有「生效与提交状态」，每 5 秒刷新一次：

| 字段 | 含义 |
|---|---|
| 主状态行 | 已生效 / 待应用 / 已禁用 / 配置文件缺失 / 参数已写入但服务未运行（以颜色区分） |
| 期望参数 | 按当前 UCI 设置拼出的域名后缀，如 `example.com?Line=telecom&Lang=zh` |
| 服务 / 配置状态 | ddns-go 进程是否运行、UCI 与 YAML 是否一致 |
| 上次应用时间 | 辅助脚本最近一次成功 `apply` / `clear` 的时间（记录在 `/tmp`，重启后清空） |
| YAML 中的域名 | 直接从 `ddns-go-config.yaml` 读出的 alidns 域名条目，**这是实际会发给阿里云的值**，包含用户手工填写的参数 |
| 最近一次提交 | 从 `logread` 解析 ddns-go 最近一条提交结果：成功 / 失败 / IP 未变化 / 日志中未找到，并附原始日志行 |

「待应用」表示 UCI 已保存但 YAML 尚未更新（例如只点了「保存」、或 ddns-go 自带 Web 界面刚重写过配置），点「立即应用」或「保存并应用」即可消除。状态区会列出 YAML 实际域名，因此也能直接核对双 WAN 场景下两条不同 `Line` / `RecordId` 是否都被保留。

> 「最近一次提交」来自系统日志，只反映 ddns-go 记录的最后一条更新结果；要确认阿里云侧记录值，仍以控制台或 API 查询为准。日志被清空或尚未产生提交时会显示「日志中未找到记录」。

### 创建自定义线路

在「自定义线路」处填写主域名、线路名称和 IP 段（格式 `192.0.2.0-192.0.2.254,198.51.100.0-198.51.100.255`），点「创建」即调用 `AddCustomLine`。AccessKey 直接复用 ddns-go 配置文件里已保存的密钥，无需重复填写；返回的 `LineCode` 会自动写回 UCI 并切换为「自定义线路」。

要求与限制：

- RAM 账号需要 `alidns:AddCustomLine` 权限（资源为对应域名）。
- 每段必须满足 `EndIp >= StartIp`；同一域名下所有自定义线路的 IP 段不能交叉重叠；最多 500 段。
- 需要安装 `curl` 与 `openssl-util`（`luci-app-ddns-go` 的 `LUCI_DEPENDS` 已声明）。
- 该接口是创建类操作，重复创建同名线路会失败，请在已存在时直接填写 `LineCode`。

### 手动调用（排错用）

```sh
/usr/libexec/ddns-go-alidns preview                       # 查看将要追加的参数
/usr/libexec/ddns-go-alidns apply                        # 追加到 ddns-go-config.yaml
/usr/libexec/ddns-go-alidns clear                        # 移除参数并关闭 UCI 开关
/usr/libexec/ddns-go-alidns status                       # 生效状态、YAML 实际域名、最近一次提交结果
/usr/libexec/ddns-go-alidns create_line example.com 北京线路 192.0.2.0-192.0.2.254
```

输出为 `key=value` 行，`ok=0` 时 `error=` 会给出原因，日志可通过 `logread | grep ddns-go-alidns` 查看。`status` 的关键字段：`state`（`applied` / `pending` / `disabled` / `missing`）、`in_sync`、`domain1..N`、`last_apply`、`submit`（`success` / `failed` / `unchanged` / `unknown`）。

### OpenWrt 打包说明

- 新增的 UCI 段是 `config alidns 'alidns'`，与 `config basic 'config'` 不同类型，因此不会被 `config_foreach start_instance 'basic'` 当作第二个服务实例启动。
- `ddns-go.init` 显式定义 `reload_service() { restart; }`：ddns-go 会在内存中缓存 YAML，普通 reload 不会重读配置，因此 UCI 变更触发 `reload_config` 时改为重启，让 `start_instance` 重新执行线路注入后再由 ddns-go 读取。
- `/etc/config/ddns-go` 是 conffile，升级时会被保留；`99-luci-ddns-go` 在检测到缺少 `alidns` 段时会自动补全默认值，不改动已有配置。
- `/usr/libexec/ddns-go-alidns` 仅依赖系统自带 busybox 工具（`awk/sed/tr/od/cmp/date`），调用 `AddCustomLine` 时额外使用 `curl` 和 `openssl`；脚本权限由 uci-defaults 设置为 `750`。
- rpcd ACL 已授权该脚本 `exec`，LuCI 无需额外权限即可调用。

## 说明

- 源码来源：https://github.com/sirpdboy/luci-app-ddns-go
- 源码来源：https://github.com/jeessy2/ddns-go.git
- 你可以随意使用其中的源码，但请注明出处。


## 使用与授权相关说明
 
- 本人开源的所有源码，任何引用需注明本处出处，如需修改二次发布必告之本人，未经许可不得做于任何商用用途。


# My other project

- 路由安全看门狗 ：https://github.com/sirpdboy/luci-app-watchdog
- 网络速度测试 ：https://github.com/sirpdboy/luci-app-netspeedtest
- 计划任务插件（原定时设置） : https://github.com/sirpdboy/luci-app-taskplan
- 关机功能插件 : https://github.com/sirpdboy/luci-app-poweroffdevice
- opentopd主题 : https://github.com/sirpdboy/luci-theme-opentopd
- kucat酷猫主题: https://github.com/sirpdboy/luci-theme-kucat
- kucat酷猫主题设置工具: https://github.com/sirpdboy/luci-app-kucat-config
- NFT版上网时间控制插件: https://github.com/sirpdboy/luci-app-timecontrol
- 家长控制: https://github.com/sirpdboy/luci-theme-parentcontrol
- 定时限速: https://github.com/sirpdboy/luci-app-eqosplus
- 系统高级设置 : https://github.com/sirpdboy/luci-app-advanced
- ddns-go动态域名: https://github.com/sirpdboy/luci-app-ddns-go
- 进阶设置（系统高级设置+主题设置kucat/agron/opentopd）: https://github.com/sirpdboy/luci-app-advancedplus
- 网络设置向导: https://github.com/sirpdboy/luci-app-netwizard
- 一键分区扩容: https://github.com/sirpdboy/luci-app-partexp
- lukcy大吉: https://github.com/sirpdboy/luci-app-lukcy

## 捐助

![screenshots](https://raw.githubusercontent.com/sirpdboy/openwrt/master/doc/说明3.jpg)

|     <img src="https://img.shields.io/badge/-支付宝-F5F5F5.svg" href="#赞助支持本项目-" height="25" alt="图飞了"/>  |  <img src="https://img.shields.io/badge/-微信-F5F5F5.svg" height="25" alt="图飞了" href="#赞助支持本项目-"/>  | 
| :-----------------: | :-------------: |
|![xm1](https://raw.githubusercontent.com/sirpdboy/openwrt/master/doc/支付宝.png) | ![xm1](https://raw.githubusercontent.com/sirpdboy/openwrt/master/doc/微信.png) |

<a href="#readme">
    <img src="https://img.shields.io/badge/-返回顶部-orange.svg" alt="图飞了" title="返回顶部" align="right"/>
</a>

![](https://visitor-badge-deno.deno.dev/sirpdboy.sirpdboy.svg)  [![](https://img.shields.io/badge/TG群-点击加入-FFFFFF.svg)](https://t.me/joinchat/AAAAAEpRF88NfOK5vBXGBQ)
