# 本地模型

此目录用于存放本地下载的模型权重。模型文件通常体积较大，默认不会提交到 Git。

下载 Eido 默认使用的中文向量模型：

```bash
npm run knowledge:model:download
```

命令会将模型保存到 `data/models/bge-small-zh-v1.5/`。如需使用其他模型，请将其
放在本目录，并在对应服务配置中指向该路径。
