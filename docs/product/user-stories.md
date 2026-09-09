# 用户故事

## 状态
accepted

## 用户故事

### STORY-1
作为 Origin 管理员，我希望用 Cloudflare Team Domain 和 Audience 配置这个插件，以便 DSH Origin 只信任我的 Access Application。

#### 验收标准
- GIVEN 管理员设置了 `DSH_CF_ACCESS_TEAM_DOMAIN` 和 `DSH_CF_ACCESS_AUDIENCES`
- WHEN 插件启动
- THEN 运行时以环境变量为信任根，Web Settings / Cordis 配置不能改掉该 Team Domain

#### 备注
- 关联场景：场景 E
- 关联规则：RULE-CONFIG-PRECEDENCE、RULE-CONFIG-ENV-LOCK

### STORY-2
作为远程操作者，我希望在通过 Cloudflare Access 登录后使用 Settings，以便像本地一样管理 DSH。

#### 验收标准
- GIVEN 浏览器已由 Cloudflare Access 认证，且 Origin 收到有效 `Cf-Access-Jwt-Assertion`
- AND Host/Origin 通过 DSH 原检查
- WHEN 用户打开 Settings 并保存配置
- THEN `settings/describe` / `settings/mutate` 等调用成功，UI 不再把 persistence 标为 unavailable

#### 备注
- 关联场景：场景 A
- 关联规则：RULE-AUTH-PRIVILEGED-REMOTE、RULE-CLIENT-NO-SECURITY

### STORY-3
作为远程操作者，我希望写入 Credentials、管理 Agent Preset、执行 model discovery，以便完成远程模型接入。

#### 验收标准
- GIVEN 远程请求携带有效 JWT 且 Host/Origin 合法
- WHEN 用户写入凭据、复制/删除 Preset、调用 discover models
- THEN 对应 privileged RPC 成功
- AND `agentPreset.list` / `agentPreset.select` 仍按普通 API 策略处理

#### 备注
- 关联场景：场景 A
- 关联规则：RULE-AUTH-PRIVILEGED-METHODS

### STORY-4
作为 Origin 管理员，我希望绕过 Access 或伪造 JWT 的请求无法管理配置面，以便 Origin 即使短暂暴露也不自动开放 privileged API。

#### 验收标准
- GIVEN 远程请求缺少 JWT、签名无效、iss/aud 不匹配、过期，或 JWKS 不可用
- WHEN 调用 privileged API
- THEN 请求被拒绝（缺 token 为未认证，其余为禁止）
- AND 日志只记录原因类别，不记录 token

#### 备注
- 关联场景：场景 B
- 关联规则：RULE-AUTH-FAIL-CLOSED、RULE-LOG-NO-SECRETS

### STORY-5
作为本地开发者，我希望 localhost 和 SSH tunnel 继续工作，以便不依赖 Cloudflare 也能管理 DSH。

#### 验收标准
- GIVEN 请求 Host 为 loopback
- WHEN 调用 privileged API 且不携带 JWT
- THEN 请求按 DSH 原行为允许
- AND `auth.ordinary` 不影响 loopback

#### 备注
- 关联场景：场景 C
- 关联规则：RULE-AUTH-LOOPBACK

### STORY-6
作为 Origin 管理员，我希望普通 API 可以逐步加上 JWT，以便迁移时先观察再强制。

#### 验收标准
- GIVEN `auth.ordinary=off`：远程无 JWT 的普通 API 仍走 DSH 原 trusted-host 策略
- AND `auth.ordinary=optional`：无 JWT 允许，有 JWT 则必须有效
- AND `auth.ordinary=required`：远程普通 API 必须有有效 JWT
- THEN 三种模式都不绕过 Host/Origin

#### 备注
- 关联场景：场景 D
- 关联规则：RULE-AUTH-ORDINARY-*

### STORY-7
作为 Origin 管理员，我希望标准 DSH 插件命令即可安装，以便不维护手工 patch。

#### 验收标准
- GIVEN 执行 `dsh plugin --profile web add dsh-cloudflare-access`
- WHEN 重启 DSH
- THEN Server Plugin 与 Client Module 自动加载
- AND 无需修改 `$DSH_HOME/profiles/web/cordis.patch.yml`，无需修改 DSH 安装目录

#### 备注
- 关联场景：场景 E
- 关联规则：RULE-PACKAGING-BUNDLE、RULE-PACKAGING-NO-DSH-FORK

### STORY-8
作为 Origin 管理员，我希望卸载插件后 DSH 回到官方行为，以便升级或回退时没有残留授权。

#### 验收标准
- GIVEN 插件曾启用远程 privileged
- WHEN 插件被 disable/remove 且 fiber unload
- THEN `/api` 包装与 Client capability 包装全部撤销
- AND 远程 privileged API 再次仅限 loopback

#### 备注
- 关联场景：场景 E
- 关联规则：RULE-LIFECYCLE-REVERSIBLE
