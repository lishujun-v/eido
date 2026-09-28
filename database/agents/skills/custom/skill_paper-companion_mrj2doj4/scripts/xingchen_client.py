#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
xingchen_api.py — 讯飞星辰 MaaS embedding 适配器(可选后端)。

未配置 API key / 断网 / 依赖缺失时,构造或 embed 抛异常,
由 semantic.get_embedder 捕获并回退到零依赖的 CharNgramEmbedder。
所以本文件是"能用则增强,不能用不影响主流程"的可选件。

启用方式:
    diagnose.py --embedder xingchen
    并通过环境变量提供凭证(见下)。
"""
import os


class XingchenEmbedder:
    name = "xingchen-maas"

    def __init__(self, config=None):
        config = config or {}
        # 凭证:优先 config,其次环境变量
        self.api_key = config.get("api_key") or os.environ.get("XINGCHEN_API_KEY")
        self.endpoint = config.get("endpoint") or os.environ.get(
            "XINGCHEN_EMBED_ENDPOINT", ""
        )
        if not self.api_key or not self.endpoint:
            # 缺凭证 -> 主动失败,让工厂回退。不要静默返回坏 embedder。
            raise RuntimeError(
                "XingchenEmbedder 需要 XINGCHEN_API_KEY 与 XINGCHEN_EMBED_ENDPOINT;"
                "未配置将回退到 char-ngram"
            )

    def embed(self, texts):
        """调用星辰 embedding 接口。此处留出实现位:
        用 urllib/requests POST endpoint,带 Authorization,取回向量列表。
        任何网络/解析异常应向上抛,由 SemanticMatcher 捕获降级。
        """
        raise NotImplementedError(
            "接入星辰 embedding 接口后实现:返回 list[dict|list] 向量,"
            "与 char-ngram 的稀疏 Counter 或稠密向量二选一,并相应调整 semantic.cosine。"
        )
