"""Kokoro-82M 中文语音合成测试脚本"""
from kokoro import KPipeline
import soundfile as sf
import os

OUT_DIR = "output"
os.makedirs(OUT_DIR, exist_ok=True)

# 'z' 代表中文普通话
pipeline = KPipeline(lang_code="z")

# text = "你好，我是 Kokoro，一个轻量级的开源语音合成模型。今天天气不错，适合出去走走。"
text = "你好啊，我是军军，敏敏的超级英雄"

# 中文音色：zf_xiaobei（女声）/ zm_yunjian（男声）等
voice = "zf_xiaobei"

generator = pipeline(text, voice=voice, speed=1)

saved = []
for i, (gs, ps, audio) in enumerate(generator):
    path = os.path.join(OUT_DIR, f"output_{i}.wav")
    sf.write(path, audio, 24000)
    saved.append(path)
    print(f"[{i}] 已生成: {path}")

print(f"\n完成！共生成 {len(saved)} 个音频文件")
for p in saved:
    print(" -", p)
