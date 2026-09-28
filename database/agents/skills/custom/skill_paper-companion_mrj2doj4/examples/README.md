# examples/ — 预置示例

## sample_paper.pdf

**用途**:D1-D8 验收 + 端到端 demo 用,程序自动生成的 3 页"Transformer 风格"测试 PDF。
生成脚本见 `scripts/demo_end_to_end.py` Step 0。

## 预置 arxiv 论文(可选 — 用户评测时用)

为提升热度榜"立即可用"卖点,推荐预置 2 篇经典论文的本地副本。
下载命令:

```bash
cd examples/
# Transformer (Attention Is All You Need)
curl -L -o transformer.pdf "https://arxiv.org/pdf/1706.03762"

# Attention Is All You Need — 中文版摘要(可选)
# LoRA: Low-Rank Adaptation of Large Language Models
curl -L -o lora.pdf "https://arxiv.org/pdf/2106.09685"

```

下载后跑:

```bash
python3 scripts/main.py pipeline \
    --pdf examples/transformer.pdf \
    --goal "掌握 Transformer 注意力机制" \
    --weeks 4 \
    --out ./paper_output/transformer
```

**注意**:arxiv PDF 通常无版权问题,但建议在 README 里致谢原作者。

## demo_input.json

端到端 demo 的输入示例(已过时,程序会自动生成 sample_paper.pdf,仅作历史参考)。